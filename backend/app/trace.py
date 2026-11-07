"""Agent trace helpers: id generation, span normalization, redaction and persistence."""
from __future__ import annotations

import re
import secrets
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy.orm import Session

from .models import TraceSpan


SENSITIVE_KEYS = {
    "authorization",
    "api_key",
    "apikey",
    "x_api_key",
    "token",
    "access_token",
    "refresh_token",
    "cookie",
    "set_cookie",
    "password",
    "passwd",
    "secret",
    "client_secret",
}
BEARER_RE = re.compile(r"(?i)\bBearer\s+[A-Za-z0-9._~+/=-]{4,}")
PHONE_RE = re.compile(r"(?<!\d)(?:\+?86[- ]?)?(1[3-9]\d{9})(?!\d)")
SK_RE = re.compile(r"\bsk-[A-Za-z0-9_-]{8,}\b")
TRUNCATE_LIMIT = 4000


def new_id(prefix: str) -> str:
    """Generate a short business id such as AT-1A2B3C4D5E."""
    return f"{prefix}-{secrets.token_hex(5).upper()}"


def new_trace_id() -> str:
    return f"TR-{secrets.token_hex(12).upper()}"


def _is_sensitive_key(key: str) -> bool:
    normalized = key.strip().lower().replace("-", "_")
    if normalized in SENSITIVE_KEYS:
        return True
    return normalized.endswith(("_token", "_secret", "_password", "_passwd", "_api_key"))


def _mask_phone(match: re.Match[str]) -> str:
    number = match.group(1)
    return f"{number[:3]}****{number[-4:]}"


def redact_text(text: str) -> str:
    text = BEARER_RE.sub("Bearer [REDACTED]", text)
    text = SK_RE.sub("[REDACTED]", text)
    return PHONE_RE.sub(_mask_phone, text)


def redact(value: Any) -> Any:
    """Recursively remove credentials and mask phone numbers."""
    if isinstance(value, dict):
        return {
            str(key): "[REDACTED]" if _is_sensitive_key(str(key)) else redact(item)
            for key, item in value.items()
        }
    if isinstance(value, (list, tuple)):
        return [redact(item) for item in value]
    if isinstance(value, str):
        return redact_text(value)
    return value


def truncate(value: Any, limit: int = TRUNCATE_LIMIT) -> Any:
    if isinstance(value, dict):
        return {key: truncate(item, limit) for key, item in value.items()}
    if isinstance(value, list):
        return [truncate(item, limit) for item in value]
    if isinstance(value, str) and len(value) > limit:
        return f"{value[:limit]}…[truncated]"
    return value


def sanitize(value: Any, limit: int = TRUNCATE_LIMIT) -> Any:
    return truncate(redact(value), limit)


def parse_datetime(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=UTC)
    if not isinstance(value, str) or not value.strip():
        return None
    text = value.strip().replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)


@dataclass
class Span:
    """Normalized span ready to be persisted."""

    span_type: str
    name: str
    status: str = "ok"
    input: dict[str, Any] = field(default_factory=dict)
    output: dict[str, Any] = field(default_factory=dict)
    error: str = ""
    started_at: datetime | None = None
    ended_at: datetime | None = None
    latency_ms: int = 0
    attributes: dict[str, Any] = field(default_factory=dict)
    parent_span_id: str | None = None
    id: str = field(default_factory=lambda: new_id("SP"))
    trace_id: str = ""
    run_id: str = ""


def _span_time(value: Any, base: datetime, now: datetime) -> datetime:
    parsed = parse_datetime(value)
    if parsed and abs((now - parsed).total_seconds()) <= 3600:
        return parsed
    return base


def _latency(value: Any) -> int:
    try:
        return max(0, int(float(value or 0)))
    except (TypeError, ValueError):
        return 0


def _custom_spans(
    trace: dict[str, Any],
    run_id: str,
    trace_id: str,
) -> list[Span] | None:
    """Build spans from an adapter-provided ``custom_spans`` list."""
    raw = trace.get("custom_spans")
    if not isinstance(raw, list) or not raw:
        return None
    now = datetime.now(UTC)
    spans: list[Span] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        started = parse_datetime(item.get("started_at") or item.get("startedAt")) or now
        ended = parse_datetime(item.get("ended_at") or item.get("endedAt")) or started
        spans.append(Span(
            span_type=str(item.get("span_type") or item.get("spanType") or "agent"),
            name=str(item.get("name") or ""),
            status=str(item.get("status") or "ok"),
            input=item.get("input") if isinstance(item.get("input"), dict) else {},
            output=item.get("output") if isinstance(item.get("output"), dict) else {},
            error=str(item.get("error") or ""),
            started_at=started,
            ended_at=ended,
            latency_ms=_latency(item.get("latency_ms") or item.get("latencyMs")),
            attributes=item.get("attributes") if isinstance(item.get("attributes"), dict) else {},
            parent_span_id=item.get("parent_span_id") or item.get("parentSpanId"),
            id=str(item.get("id") or new_id("SP")),
            trace_id=trace_id,
            run_id=run_id,
        ))
    return spans


def normalize_trace(
    trace: dict[str, Any],
    run_id: str,
    trace_id: str,
    command: str = "",
    payload: dict[str, Any] | None = None,
) -> list[Span]:
    """Convert an Agent trace payload into the contract's span model."""
    custom = _custom_spans(trace, run_id, trace_id)
    if custom is not None:
        return custom

    now = datetime.now(UTC)
    total_latency = _latency(trace.get("latency_ms"))
    base = now - timedelta(milliseconds=total_latency)
    agent_status = str(trace.get("status") or "ok")
    span_status = "ok" if agent_status in {"ok", "need_auth"} else "error"

    command_span = Span(
        span_type="command",
        name="命令输入",
        started_at=base,
        ended_at=base + timedelta(milliseconds=5),
        input={
            "command": command or str(trace.get("message") or ""),
            "payload": payload or {},
            "headers": trace.get("headers") or {},
        },
        trace_id=trace_id,
        run_id=run_id,
    )
    agent_span = Span(
        span_type="agent",
        name="Agent 执行",
        status=span_status,
        started_at=base + timedelta(milliseconds=5),
        ended_at=now,
        latency_ms=total_latency,
        input={"message": str(trace.get("message") or command or "")},
        output={
            "intent": trace.get("intent"),
            "agent": trace.get("agent"),
            "status": agent_status,
        },
        attributes={"steps": trace.get("steps") or []},
        parent_span_id=command_span.id,
        trace_id=trace_id,
        run_id=run_id,
    )

    spans: list[Span] = [command_span, agent_span]
    for call in trace.get("llm_calls") or []:
        if not isinstance(call, dict):
            continue
        latency = _latency(call.get("latency_ms"))
        started = _span_time(call.get("at"), base, now)
        spans.append(Span(
            span_type="llm",
            name=f"LLM · {call.get('node') or 'unknown'}",
            status=str(call.get("status") or "ok"),
            input={"prompt": call.get("prompt") or ""},
            output={"response": call.get("response") or "", "model": call.get("model") or ""},
            started_at=started,
            ended_at=started + timedelta(milliseconds=latency),
            latency_ms=latency,
            attributes={"usage": call.get("usage") or {}},
            parent_span_id=agent_span.id,
            trace_id=trace_id,
            run_id=run_id,
        ))

    for call in trace.get("tool_calls") or []:
        if not isinstance(call, dict):
            continue
        latency = _latency(call.get("latency_ms"))
        started = _span_time(call.get("at"), base, now)
        spans.append(Span(
            span_type="tool",
            name=f"工具 · {call.get('name') or 'unknown'}",
            status=str(call.get("status") or "ok"),
            input={"args": call.get("args") or {}},
            output={"result": call.get("result") or {}},
            error=str(call.get("error") or ""),
            started_at=started,
            ended_at=started + timedelta(milliseconds=latency),
            latency_ms=latency,
            parent_span_id=agent_span.id,
            trace_id=trace_id,
            run_id=run_id,
        ))

    for retrieval in trace.get("retrievals") or []:
        if not isinstance(retrieval, dict):
            continue
        latency = _latency(retrieval.get("latency_ms"))
        started = _span_time(retrieval.get("at"), base, now)
        spans.append(Span(
            span_type="retrieval",
            name=f"检索 · {retrieval.get('backend') or 'unknown'}",
            status="error" if retrieval.get("error") else "ok",
            input={"query": retrieval.get("query") or ""},
            output={
                "hits": retrieval.get("hits") or [],
                "fallback": bool(retrieval.get("fallback")),
                "error": retrieval.get("error"),
            },
            error=str(retrieval.get("error") or ""),
            started_at=started,
            ended_at=started + timedelta(milliseconds=latency),
            latency_ms=latency,
            parent_span_id=agent_span.id,
            trace_id=trace_id,
            run_id=run_id,
        ))

    tools = [item.get("name") for item in trace.get("tool_calls") or [] if isinstance(item, dict)]
    spans.append(Span(
        span_type="final",
        name="最终回答",
        status=span_status,
        started_at=now,
        ended_at=now,
        input={},
        output={"answer": trace.get("answer") or "", "status": agent_status, "tools": tools},
        parent_span_id=agent_span.id,
        trace_id=trace_id,
        run_id=run_id,
    ))
    return spans


def error_spans(
    run_id: str,
    trace_id: str,
    command: str,
    config: dict[str, Any] | None,
    error: str,
) -> list[Span]:
    now = datetime.now(UTC)
    command_span = Span(
        span_type="command",
        name="命令输入",
        started_at=now,
        ended_at=now,
        input={"command": command, "payload": {}, "headers": (config or {}).get("headers") or {}},
        trace_id=trace_id,
        run_id=run_id,
    )
    final_span = Span(
        span_type="final",
        name="最终回答",
        status="error",
        started_at=now,
        ended_at=now,
        output={"error": error},
        error=error,
        parent_span_id=command_span.id,
        trace_id=trace_id,
        run_id=run_id,
    )
    return [command_span, final_span]


def trace_total_tokens(trace: dict[str, Any]) -> int:
    total = 0
    for call in trace.get("llm_calls") or []:
        if not isinstance(call, dict):
            continue
        usage = call.get("usage") or {}
        total += _latency(usage.get("prompt_tokens") or usage.get("prompt"))
        total += _latency(usage.get("completion_tokens") or usage.get("completion"))
        if not usage:
            total += _latency(call.get("tokens"))
    for turn in trace.get("conversation") or []:
        if not isinstance(turn, dict):
            continue
        tokens = turn.get("tokens") or {}
        if isinstance(tokens, dict):
            total += _latency(tokens.get("prompt") or tokens.get("prompt_tokens"))
            total += _latency(tokens.get("completion") or tokens.get("completion_tokens"))
    return total


def save_spans(db: Session, spans: list[Span]) -> list[TraceSpan]:
    """Persist normalized spans with redaction and truncation applied."""
    records: list[TraceSpan] = []
    for span in spans:
        record = TraceSpan(
            id=span.id,
            trace_id=span.trace_id,
            run_id=span.run_id,
            parent_span_id=span.parent_span_id,
            span_type=span.span_type,
            name=span.name[:200],
            status=span.status,
            input=sanitize(span.input),
            output=sanitize(span.output),
            error=sanitize(span.error, 1000),
            started_at=span.started_at,
            ended_at=span.ended_at,
            latency_ms=span.latency_ms,
            attributes=sanitize(span.attributes),
        )
        db.add(record)
        records.append(record)
    db.flush()
    return records


def span_snapshot(span: TraceSpan) -> dict[str, Any]:
    """Internal (snake_case) span dictionary used by evaluators and fix docs."""
    return {
        "id": span.id,
        "trace_id": span.trace_id,
        "run_id": span.run_id,
        "parent_span_id": span.parent_span_id,
        "span_type": span.span_type,
        "name": span.name,
        "status": span.status,
        "input": span.input or {},
        "output": span.output or {},
        "error": span.error,
        "latency_ms": span.latency_ms,
        "attributes": span.attributes or {},
    }
