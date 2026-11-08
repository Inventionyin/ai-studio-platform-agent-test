"""Real conversation read/label/convert APIs."""
from __future__ import annotations

from datetime import UTC, datetime
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from datetime import timedelta

from sqlalchemy import delete, func, or_, select
from sqlalchemy.orm import Session

from ..auth import get_current_user, project_editor_scope, project_scope
from ..db import get_db
from ..models import AgentConversation, AgentRun, AgentTestCase, RunEvaluation, TraceSpan, User
from ..response import ok
from ..trace import new_id
from .deps import get_case
from .serializers import conversation_public, evaluation_public, run_public, span_public

router = APIRouter()


class ConversationLabel(BaseModel):
    verdict: Literal["pass", "fail", "needs_review"] = "needs_review"
    score: float | None = Field(default=None, ge=0, le=1)
    comment: str = ""


class ConversationToCase(BaseModel):
    name: str | None = None
    targetId: str | None = None


@router.post("/maintenance/retention")
def purge_expired_conversations(
    days: int = 30,
    pid: str = Depends(project_editor_scope),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """真实数据保留策略：默认清理 30 天前的人工/生产会话（级联删除 runs）。"""
    cutoff = datetime.now(UTC) - timedelta(days=max(1, days))
    result = db.execute(delete(AgentConversation).where(
        AgentConversation.project_id == pid,
        AgentConversation.source_type.in_(["human_manual", "production"]),
        AgentConversation.created_at < cutoff,
    ))
    db.commit()
    return ok({"deletedConversations": result.rowcount or 0, "cutoff": cutoff.isoformat()})


@router.get("/data-summary")
def data_summary(
    pid: str = Depends(project_scope),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    def run_count(source_type: str) -> int:
        return db.scalar(select(func.count(AgentRun.id)).where(
            AgentRun.project_id == pid, AgentRun.source_type == source_type
        )) or 0

    def conversation_count(source_type: str) -> int:
        return db.scalar(select(func.count(AgentConversation.id)).where(
            AgentConversation.project_id == pid, AgentConversation.source_type == source_type
        )) or 0

    return ok({
        "testRuns": run_count("ai_test"),
        "manualConversations": conversation_count("human_manual"),
        "productionConversations": conversation_count("production"),
        "failedTestRuns": db.scalar(select(func.count(AgentRun.id)).where(
            AgentRun.project_id == pid, AgentRun.source_type == "ai_test", AgentRun.status == "fail"
        )) or 0,
    })


@router.get("/conversations")
def list_conversations(
    sourceType: str | None = None,
    environment: str | None = None,
    status: str | None = None,
    q: str | None = None,
    limit: int = 50,
    offset: int = 0,
    pid: str = Depends(project_scope),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    stmt = select(AgentConversation).where(AgentConversation.project_id == pid)
    if sourceType:
        stmt = stmt.where(AgentConversation.source_type == sourceType)
    if environment:
        stmt = stmt.where(AgentConversation.environment == environment)
    if status:
        stmt = stmt.where(AgentConversation.status == status)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(
            AgentConversation.external_session_id.ilike(like),
            AgentConversation.customer_ref.ilike(like),
        ))
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    items = db.scalars(
        stmt.order_by(AgentConversation.updated_at.desc()).offset(max(0, offset)).limit(min(limit, 100))
    ).all()
    return ok({"items": [conversation_public(item) for item in items], "total": total})


@router.get("/conversations/{conversation_id}")
def conversation_detail(
    conversation_id: str,
    pid: str = Depends(project_scope),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    conversation = db.get(AgentConversation, conversation_id)
    if conversation is None or conversation.project_id != pid:
        raise HTTPException(404, "会话不存在")
    runs = db.scalars(
        select(AgentRun).where(AgentRun.conversation_id == conversation_id).order_by(AgentRun.started_at, AgentRun.id)
    ).all()
    items = []
    for run in runs:
        spans = db.scalars(select(TraceSpan).where(TraceSpan.run_id == run.id).order_by(TraceSpan.started_at)).all()
        evaluations = db.scalars(select(RunEvaluation).where(RunEvaluation.run_id == run.id)).all()
        items.append({
            "run": run_public(run),
            "spans": [span_public(span) for span in spans],
            "evaluations": [evaluation_public(item) for item in evaluations],
        })
    return ok({"conversation": conversation_public(conversation), "runs": items})


@router.post("/conversations/{conversation_id}/label")
def label_conversation(
    conversation_id: str,
    body: ConversationLabel,
    pid: str = Depends(project_editor_scope),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    conversation = db.get(AgentConversation, conversation_id)
    if conversation is None or conversation.project_id != pid:
        raise HTTPException(404, "会话不存在")
    run = db.scalar(select(AgentRun).where(AgentRun.conversation_id == conversation_id)
                    .order_by(AgentRun.started_at.desc()).limit(1))
    if run is None:
        raise HTTPException(400, "会话没有可标注的运行")
    evaluation = RunEvaluation(
        id=new_id("RE"),
        run_id=run.id,
        evaluator_type="human",
        verdict=body.verdict,
        score=body.score,
        checks=[],
        comment=body.comment,
        model="",
        prompt="",
        response="",
        created_by=user.id,
    )
    db.add(evaluation)
    run.verdict = {**(run.verdict or {}), "human": {
        "verdict": body.verdict, "score": body.score, "comment": body.comment,
    }}
    db.commit()
    return ok({"evaluation": evaluation_public(evaluation), "runId": run.id})


@router.post("/conversations/{conversation_id}/to-case")
def conversation_to_case(
    conversation_id: str,
    body: ConversationToCase,
    pid: str = Depends(project_editor_scope),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    conversation = db.get(AgentConversation, conversation_id)
    if conversation is None or conversation.project_id != pid:
        raise HTTPException(404, "会话不存在")
    run = db.scalar(select(AgentRun).where(AgentRun.conversation_id == conversation_id)
                    .order_by(AgentRun.started_at).limit(1))
    if run is None:
        raise HTTPException(400, "会话没有可转换的运行")
    command = str((run.input or {}).get("command") or "")
    name = body.name or f"真实会话 {conversation.external_session_id[:8]} · {command[:24]}"
    case = AgentTestCase(
        id=new_id("AC"),
        project_id=pid,
        target_id=body.targetId or conversation.target_id,
        name=name[:200],
        input_type="text",
        command=command,
        turns=[command] if command else [],
        payload={
            "source": "real_conversation",
            "conversationId": conversation_id,
            "externalSessionId": conversation.external_session_id,
        },
        expected={},
        checks=[],
        tags=[f"from-real:{conversation_id}", "real-conversation"],
        priority="P1",
        enabled=True,
        version="v1.0",
        created_by=user.id,
    )
    db.add(case)
    db.commit()
    return ok({"caseId": case.id, "name": case.name})
