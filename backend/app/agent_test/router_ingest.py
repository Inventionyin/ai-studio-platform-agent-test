"""External real-conversation ingestion (Shang Pinhui webhook)."""
from __future__ import annotations

import hashlib
import hmac
import json
import re
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..db import get_db
from ..models import AgentConversation, AgentIngestEvent, AgentRun, AgentTarget, TraceSpan
from ..response import ok
from ..trace import new_id

router = APIRouter()

SOURCE = "shangpin"


def _verify_signature(raw: bytes, timestamp: str, signature: str) -> None:
    secret = settings.ingest_webhook_secret
    if not secret:
        return
    if not timestamp or not signature:
        raise HTTPException(401, "missing webhook signature")
    expected = hmac.new(
        secret.encode("utf-8"),
        raw + b"\n" + timestamp.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(expected, signature):
        raise HTTPException(401, "invalid webhook signature")


def _mask_pii(text: str) -> str:
    """平台侧兜底脱敏：手机号/身份证/邮箱。"""
    text = re.sub(r"(?<!\d)1[3-9]\d{9}(?!\d)", "1**********", text or "")
    text = re.sub(r"(?<!\d)\d{17}[\dXx](?!\d)", "******************", text)
    return re.sub(r"[\w.+-]+@[\w-]+\.[\w.]+", "***@***", text)


def _upsert_conversation(db: Session, project_id: str, target_id: str, payload: dict[str, Any],
                         source_type: str, is_test: bool) -> AgentConversation:
    external_id = str(payload.get("externalSessionId") or payload.get("sessionId")
                      or f"event-{payload.get('eventId')}")
    conversation = db.scalar(select(AgentConversation).where(
        AgentConversation.project_id == project_id,
        AgentConversation.target_id == target_id,
        AgentConversation.source_type == source_type,
        AgentConversation.external_session_id == external_id,
    ))
    if conversation is None:
        conversation = AgentConversation(
            id=new_id("CV"),
            project_id=project_id,
            target_id=target_id,
            source_type=source_type,
            environment="prod" if source_type == "production" else "test",
            external_session_id=external_id,
            channel=str(payload.get("clientType") or payload.get("channel") or ""),
            status=str(payload.get("sessionStatus") or "AI_ONGOING"),
            is_test=is_test,
            pii_masked=True,
            metadata_={"source": SOURCE},
            started_at=datetime.now(UTC),
        )
        db.add(conversation)
        db.flush()
    conversation.message_count = (conversation.message_count or 0) + 1
    conversation.updated_at = datetime.now(UTC)
    return conversation


@router.post("/ingest/shangpin")
async def ingest_shangpin(
    request: Request,
    pid: str | None = Query(default=None),
    targetId: str | None = Query(default=None),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    raw = await request.body()
    _verify_signature(
        raw,
        request.headers.get("X-Shang-Timestamp", ""),
        request.headers.get("X-Shang-Signature", ""),
    )
    try:
        payload = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise HTTPException(400, "invalid JSON") from exc
    if not isinstance(payload, dict):
        raise HTTPException(400, "payload must be an object")

    event_id = str(payload.get("eventId") or request.headers.get("X-Shang-Event-Id") or "")
    if not event_id:
        raise HTTPException(400, "missing eventId")
    if db.scalar(select(AgentIngestEvent).where(
        AgentIngestEvent.source == SOURCE, AgentIngestEvent.event_id == event_id
    )):
        return ok({"duplicate": True})

    project_id = pid or settings.ingest_default_project
    target_id = targetId or settings.ingest_default_target
    if not target_id:
        raise HTTPException(400, "targetId is required")
    target = db.get(AgentTarget, target_id)
    if target is None or target.project_id != project_id:
        raise HTTPException(404, "target not found")

    is_test = bool(payload.get("isTest"))
    source_type = "production"
    if is_test:
        source_type = "human_manual" if str(payload.get("testSource")) == "human" else "ai_test"

    event = AgentIngestEvent(
        id=new_id("IE"),
        source=SOURCE,
        event_id=event_id,
        event_type=str(payload.get("eventType") or ""),
        payload=payload,
        status="processed",
        processed_at=datetime.now(UTC),
    )
    db.add(event)

    if str(payload.get("eventType") or "") == "run.finished":
        conversation = _upsert_conversation(db, project_id, target_id, payload, source_type, is_test)
        external_run_id = str(payload.get("externalRunId") or payload.get("runId") or "")
        run = db.scalar(select(AgentRun).where(
            AgentRun.project_id == project_id,
            AgentRun.target_id == target_id,
            AgentRun.external_run_id == external_run_id,
        ))
        now = datetime.now(UTC)
        answer = _mask_pii(str(payload.get("answer") or ""))
        user_text = _mask_pii(str(payload.get("userText") or ""))
        cards = payload.get("cards") or []
        sources = payload.get("sources") or []
        tools = payload.get("tools") or []
        if run is None:
            run = AgentRun(
                id=new_id("AR"),
                project_id=project_id,
                target_id=target_id,
                case_id=None,
                conversation_id=conversation.id,
                source_type=source_type,
                environment=conversation.environment,
                external_session_id=conversation.external_session_id,
                external_run_id=external_run_id,
                external_message_id=str(payload.get("externalMessageId") or ""),
                is_test=is_test,
                pii_masked=True,
                metadata_={"intent": payload.get("intent"), "agent": payload.get("agent")},
                trace_id=new_id("TR"),
                status="observed",
                input={"command": user_text, "turns": [user_text], "source": SOURCE},
                final_output={"answer": answer, "cards": cards, "sources": sources, "tools": tools},
                conversation=[{
                    "input": user_text, "answer": answer, "cards": cards, "sources": sources,
                    "tools": tools, "intent": payload.get("intent"), "agent": payload.get("agent"),
                    "status": payload.get("status"),
                }],
                verdict={},
                error="",
                latency_ms=int(payload.get("latencyMs") or 0),
                total_tokens=int(payload.get("tokens") or 0),
                started_at=now,
                finished_at=now,
                triggered_by="webhook",
                ingested_at=now,
            )
            db.add(run)
            db.flush()
            trace_id = run.trace_id
            db.add_all([
                TraceSpan(
                    id=new_id("SP"), trace_id=trace_id, run_id=run.id, span_type="command",
                    name="用户输入", status="ok", input={"turn": user_text}, output={},
                    latency_ms=0, started_at=now, ended_at=now, attributes={"source": SOURCE},
                ),
                TraceSpan(
                    id=new_id("SP"), trace_id=trace_id, run_id=run.id, span_type="final",
                    name="最终回答", status="ok", input={},
                    output={"answer": answer, "cards": cards, "sources": sources, "tools": tools},
                    latency_ms=run.latency_ms, started_at=now, ended_at=now, attributes={"source": SOURCE},
                ),
            ])
        else:
            run.final_output = {"answer": answer, "cards": cards, "sources": sources, "tools": tools}
            run.conversation = [{
                "input": user_text, "answer": answer, "cards": cards, "sources": sources,
                "tools": tools, "intent": payload.get("intent"), "agent": payload.get("agent"),
                "status": payload.get("status"),
            }]
            run.latency_ms = int(payload.get("latencyMs") or run.latency_ms or 0)
            run.total_tokens = int(payload.get("tokens") or run.total_tokens or 0)
            run.ingested_at = now

    db.commit()
    return ok({"duplicate": False, "eventId": event_id})
