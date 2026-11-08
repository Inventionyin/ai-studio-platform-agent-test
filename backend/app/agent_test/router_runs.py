"""Agent run and evaluation routes."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import get_current_user, project_editor_scope, project_reviewer_scope, project_scope
from ..db import get_db
from ..models import AgentRun, User
from ..response import ok
from .deps import evaluations_for, get_case, get_run, get_target
from .evaluators import evaluate_llm, evaluate_rules
from .schemas import EvaluateRequest, RunCreate
from .serializers import evaluation_public, run_public
from .service import (
    execute_run,
    load_snapshots,
    persist_human_evaluation,
    persist_judge_evaluation,
    persist_rule_evaluation,
    rebuild_trace_view,
    run_detail,
)

router = APIRouter()


@router.post("/runs")
def create_run(
    body: RunCreate,
    pid: str = Depends(project_editor_scope),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    case = get_case(db, pid, body.caseId)
    target_id = body.targetId or case.target_id
    if not target_id:
        raise HTTPException(400, "请为用例指定默认目标或传入 targetId")
    run = execute_run(db, pid, case, get_target(db, pid, target_id), user.id)
    return ok(run_detail(db, run))


@router.get("/runs")
def list_runs(
    caseId: str | None = None,
    targetId: str | None = None,
    status: str | None = None,
    sourceType: str | None = None,
    environment: str | None = None,
    conversationId: str | None = None,
    pid: str = Depends(project_scope),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    stmt = select(AgentRun).where(AgentRun.project_id == pid)
    if caseId:
        stmt = stmt.where(AgentRun.case_id == caseId)
    if targetId:
        stmt = stmt.where(AgentRun.target_id == targetId)
    if status:
        stmt = stmt.where(AgentRun.status == status)
    if sourceType:
        stmt = stmt.where(AgentRun.source_type == sourceType)
    if environment:
        stmt = stmt.where(AgentRun.environment == environment)
    if conversationId:
        stmt = stmt.where(AgentRun.conversation_id == conversationId)
    items = db.scalars(stmt.order_by(AgentRun.created_at.desc())).all()
    return ok([run_public(item) for item in items])


@router.get("/runs/{run_id}")
def get_run_detail(
    run_id: str,
    pid: str = Depends(project_scope),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    return ok(run_detail(db, get_run(db, pid, run_id)))


@router.post("/runs/{run_id}/rerun")
def rerun(
    run_id: str,
    pid: str = Depends(project_editor_scope),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    previous = get_run(db, pid, run_id)
    case = get_case(db, pid, previous.case_id)
    target = get_target(db, pid, previous.target_id)
    run = execute_run(db, pid, case, target, user.id)
    return ok(run_detail(db, run))


@router.post("/runs/{run_id}/evaluate")
def evaluate_run(
    run_id: str,
    body: EvaluateRequest,
    pid: str = Depends(project_reviewer_scope),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    run = get_run(db, pid, run_id)
    case = get_case(db, pid, run.case_id)
    snapshots = load_snapshots(db, run.id)
    if body.evaluatorType == "rule":
        view = rebuild_trace_view(run, snapshots)
        result = evaluate_rules(view, case.expected or {}, case.checks or [], snapshots)
        persist_rule_evaluation(db, run, result, user.id)
    elif body.evaluatorType == "llm":
        outcome = evaluate_llm(
            {
                "status": run.status,
                "final_output": run.final_output,
                "conversation": run.conversation or [],
                "verdict": run.verdict,
            },
            {
                "name": case.name,
                "command": case.command,
                "turns": case.turns or [],
                "expected": case.expected,
                "checks": case.checks,
            },
            snapshots,
        )
        persist_judge_evaluation(db, run, outcome, user.id)
    else:
        if not body.verdict:
            raise HTTPException(400, "人工评审必须提供 verdict")
        persist_human_evaluation(db, run, body.verdict, body.comment, body.score, user.id)
    return ok({
        "evaluations": [evaluation_public(item) for item in evaluations_for(db, run.id)],
        "run": run_public(run),
    })
