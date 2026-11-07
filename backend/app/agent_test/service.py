"""Shared execution / persistence logic for the Agent test router."""
from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import AgentRun, AgentTestCase, AgentTarget, RunEvaluation, TraceArtifact, TraceSpan
from ..trace import (
    error_spans,
    new_id,
    new_trace_id,
    normalize_trace,
    sanitize,
    save_spans,
    span_snapshot,
    trace_total_tokens,
)
from .adapters import AdapterError, run_target
from .evaluators import evaluate_rules
from .serializers import artifact_public, evaluation_public, run_public, span_public


def _elapsed(started: datetime) -> int:
    return max(0, int((datetime.now(UTC) - started).total_seconds() * 1000))


def _merge_verdict(run: AgentRun, key: str, payload: dict[str, Any]) -> None:
    verdict = dict(run.verdict or {})
    verdict[key] = payload
    run.verdict = verdict


def recompute_run_status(db: Session, run: AgentRun) -> str:
    """Aggregate the latest evaluation verdicts into the run status."""
    latest: dict[str, str] = {}
    records = db.scalars(
        select(RunEvaluation).where(RunEvaluation.run_id == run.id)
        .order_by(RunEvaluation.created_at, RunEvaluation.id)
    ).all()
    for evaluation in records:
        latest[evaluation.evaluator_type] = evaluation.verdict
    values = list(latest.values())
    if any(value == "fail" for value in values):
        status = "fail"
    elif any(value in {"needs_review", "unavailable"} for value in values):
        status = "needs_review"
    elif (
        latest.get("rule") == "pass"
        and latest.get("llm") in {None, "pass"}
        and latest.get("human") in {None, "pass"}
    ):
        status = "pass"
    else:
        status = "needs_review"
    run.status = status
    return status


def persist_rule_evaluation(
    db: Session,
    run: AgentRun,
    result: dict[str, Any],
    user_id: str | None,
) -> RunEvaluation:
    result = sanitize(result)
    checks = result.get("checks") or []
    passed = sum(1 for item in checks if item.get("passed"))
    evaluation = RunEvaluation(
        id=new_id("RE"),
        run_id=run.id,
        evaluator_type="rule",
        verdict=str(result.get("verdict") or "needs_review"),
        score=result.get("score"),
        checks=checks,
        comment=f"规则检查通过 {passed}/{len(checks)}",
        model="",
        prompt="",
        response="",
        created_by=user_id,
    )
    db.add(evaluation)
    _merge_verdict(run, "rule", {
        "verdict": evaluation.verdict,
        "score": evaluation.score,
        "evaluatorId": evaluation.id,
    })
    db.flush()
    recompute_run_status(db, run)
    db.commit()
    return evaluation


def execute_run(
    db: Session,
    project_id: str,
    case: AgentTestCase,
    target: AgentTarget,
    user_id: str,
) -> AgentRun:
    """Run a case synchronously, persist the trace and apply rule checks."""
    started = datetime.now(UTC)
    trace_id = new_trace_id()
    turns = [str(item) for item in (case.turns or []) if str(item).strip()] or [case.command]
    run_input: dict[str, Any] = {"command": case.command, "payload": case.payload or {}}
    if case.turns:
        run_input["turns"] = turns
    run = AgentRun(
        id=new_id("AR"),
        project_id=project_id,
        target_id=target.id,
        case_id=case.id,
        trace_id=trace_id,
        status="running",
        input=sanitize(run_input),
        final_output={},
        conversation=[],
        verdict={},
        error="",
        latency_ms=0,
        total_tokens=0,
        started_at=started,
        triggered_by=user_id,
    )
    db.add(run)
    db.flush()
    try:
        result = run_target(
            target.adapter_type,
            target.config or {},
            case.command,
            case.payload or {},
            turns=turns,
        )
    except Exception as exc:  # noqa: BLE001 - a bad target must never leave a running run
        message = str(exc) if isinstance(exc, AdapterError) else f"{type(exc).__name__}: {exc}"
        save_spans(db, error_spans(run.id, trace_id, case.command, target.config or {}, message))
        run.status = "error"
        run.error = sanitize(message, 1000)
        run.final_output = sanitize({"status": "error", "error": message})
        run.finished_at = datetime.now(UTC)
        run.latency_ms = _elapsed(started)
        db.commit()
        return run

    spans = normalize_trace(result.trace, run.id, trace_id, command=case.command, payload=case.payload or {})
    records = save_spans(db, spans)
    run.conversation = sanitize(result.conversation or [])
    run.final_output = sanitize(result.final_output)
    run.latency_ms = int(result.trace.get("latency_ms") or result.latency_ms)
    run.total_tokens = trace_total_tokens(result.trace)
    snapshots = [span_snapshot(record) for record in records]
    rule = evaluate_rules(result.trace, case.expected or {}, case.checks or [], snapshots)
    run.verdict = sanitize(rule)
    run.status = "pass" if rule.get("verdict") == "pass" else "fail"
    run.finished_at = datetime.now(UTC)
    persist_rule_evaluation(db, run, rule, user_id)
    return run


def rebuild_trace_view(run: AgentRun, snapshots: list[dict[str, Any]]) -> dict[str, Any]:
    """Rebuild the minimal trace view from persisted spans for re-evaluation."""
    view: dict[str, Any] = {
        "status": (run.final_output or {}).get("status") or run.status,
        "answer": (run.final_output or {}).get("answer") or "",
        "intent": None,
        "agent": None,
        "tool_calls": [],
        "retrievals": [],
        "latency_ms": run.latency_ms,
        "final_output": run.final_output or {},
        "conversation": run.conversation or [],
    }
    for span in snapshots:
        span_type = span.get("span_type")
        output = span.get("output") or {}
        if span_type == "agent":
            view["intent"] = output.get("intent")
            view["agent"] = output.get("agent")
        elif span_type == "tool":
            name = str(span.get("name") or "").removeprefix("工具 · ")
            view["tool_calls"].append({
                "name": name,
                "status": span.get("status"),
                "result": output.get("result"),
            })
        elif span_type == "retrieval":
            view["retrievals"].append({
                "query": (span.get("input") or {}).get("query"),
                "backend": str(span.get("name") or "").removeprefix("检索 · "),
                "hits": output.get("hits") or [],
                "fallback": output.get("fallback"),
                "error": output.get("error"),
            })
        elif span_type == "final":
            view["answer"] = output.get("answer") or view["answer"]
            view["status"] = output.get("status") or view["status"]
    return view


def load_snapshots(db: Session, run_id: str) -> list[dict[str, Any]]:
    records = db.scalars(
        select(TraceSpan).where(TraceSpan.run_id == run_id).order_by(TraceSpan.started_at, TraceSpan.id)
    ).all()
    return [span_snapshot(record) for record in records]


def run_detail(db: Session, run: AgentRun) -> dict[str, Any]:
    spans = db.scalars(
        select(TraceSpan).where(TraceSpan.run_id == run.id).order_by(TraceSpan.started_at, TraceSpan.id)
    ).all()
    artifacts = db.scalars(
        select(TraceArtifact).where(TraceArtifact.run_id == run.id).order_by(TraceArtifact.created_at)
    ).all()
    evaluations = db.scalars(
        select(RunEvaluation).where(RunEvaluation.run_id == run.id).order_by(RunEvaluation.created_at, RunEvaluation.id)
    ).all()
    return {
        "run": run_public(run),
        "spans": [span_public(item) for item in spans],
        "artifacts": [artifact_public(item) for item in artifacts],
        "evaluations": [evaluation_public(item) for item in evaluations],
    }


def persist_judge_evaluation(
    db: Session,
    run: AgentRun,
    outcome: dict[str, Any],
    user_id: str | None,
) -> RunEvaluation:
    span = outcome["span"]
    span.trace_id = run.trace_id
    span.run_id = run.id
    save_spans(db, [span])
    payload = outcome["evaluation"]
    evaluation = RunEvaluation(
        id=new_id("RE"),
        run_id=run.id,
        evaluator_type="llm",
        verdict=str(payload.get("verdict") or "unavailable"),
        score=payload.get("score"),
        checks=sanitize(payload.get("checks") or []),
        comment=str(payload.get("comment") or ""),
        model=str(payload.get("model") or ""),
        prompt=str(payload.get("prompt") or ""),
        response=str(payload.get("response") or ""),
        created_by=user_id,
    )
    db.add(evaluation)
    _merge_verdict(run, "llm", {
        "verdict": evaluation.verdict,
        "score": evaluation.score,
        "evaluatorId": evaluation.id,
    })
    db.flush()
    recompute_run_status(db, run)
    db.commit()
    return evaluation


def persist_human_evaluation(
    db: Session,
    run: AgentRun,
    verdict: str,
    comment: str,
    score: float | None,
    user_id: str | None,
) -> RunEvaluation:
    evaluation = RunEvaluation(
        id=new_id("RE"),
        run_id=run.id,
        evaluator_type="human",
        verdict=verdict,
        score=score,
        checks=[],
        comment=comment,
        model="",
        prompt="",
        response="",
        created_by=user_id,
    )
    db.add(evaluation)
    _merge_verdict(run, "human", {
        "verdict": verdict,
        "score": score,
        "evaluatorId": evaluation.id,
    })
    db.flush()
    recompute_run_status(db, run)
    db.commit()
    return evaluation
