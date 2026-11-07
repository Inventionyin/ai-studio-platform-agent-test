"""Agent fix workbench routes."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import get_current_user, project_editor_scope, project_scope
from ..db import get_db
from ..models import FixRecord, TraceSpan, User
from ..response import ok
from ..trace import new_id
from .deps import get_fix, get_run
from .fixdocs import generate_fix_document, slugify
from .schemas import FixCreate, FixUpdate, RegressionRequest
from .serializers import fix_public
from .service import run_detail

router = APIRouter()


def _write_fix_doc(db: Session, fix: FixRecord, run, before, after) -> None:
    """Render the experience markdown for a fix and persist its path."""
    spans = db.scalars(
        select(TraceSpan).where(TraceSpan.run_id == run.id).order_by(TraceSpan.started_at, TraceSpan.id)
    ).all()
    fix_dict = {
        "id": fix.id, "title": fix.title, "slug": fix.slug, "severity": fix.severity,
        "category": fix.category, "fix_target": fix.fix_target, "status": fix.status,
        "symptom": fix.symptom, "root_cause": fix.root_cause, "fix_action": fix.fix_action,
        "changed_files": fix.changed_files or [], "case_id": fix.case_id, "target_id": fix.target_id,
        "before_run_id": fix.before_run_id, "after_run_id": fix.after_run_id,
        "created_by": fix.created_by, "created_at": fix.created_at.isoformat() if fix.created_at else None,
        "doc_path": fix.doc_path,
    }
    run_dict = {
        "id": run.id, "trace_id": run.trace_id, "status": run.status,
        "verdict": run.verdict or {}, "input": run.input or {},
    }
    span_rows = [
        {"span_type": span.span_type, "name": span.name, "status": span.status, "latency_ms": span.latency_ms}
        for span in spans
    ]
    fix.doc_path = generate_fix_document(
        fix_dict,
        run_dict,
        span_rows,
        {"status": before.status, "verdict": before.verdict} if before else None,
        {"status": after.status, "verdict": after.verdict} if after else None,
    )
    db.commit()


@router.get("/fixes")
def list_fixes(pid: str = Depends(project_scope), db: Session = Depends(get_db)) -> dict[str, Any]:
    items = db.scalars(
        select(FixRecord).where(FixRecord.project_id == pid).order_by(FixRecord.created_at.desc())
    ).all()
    return ok([fix_public(item) for item in items])


@router.post("/fixes")
def create_fix(
    body: FixCreate,
    pid: str = Depends(project_editor_scope),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    run = get_run(db, pid, body.runId)
    fix = FixRecord(
        id=new_id("FX"), project_id=pid, run_id=run.id, case_id=run.case_id, target_id=run.target_id,
        title=body.title, slug=slugify(body.title), severity=body.severity, category=body.category,
        fix_target=body.fixTarget, symptom=body.symptom, root_cause=body.rootCause,
        fix_action=body.fixAction, changed_files=body.changedFiles, before_run_id=run.id,
        after_run_id="", status=body.status, doc_path="", ai_suggestion=body.aiSuggestion,
        created_by=user.id,
    )
    db.add(fix)
    db.commit()
    return ok(fix_public(fix))


@router.put("/fixes/{fix_id}")
def update_fix(
    fix_id: str,
    body: FixUpdate,
    pid: str = Depends(project_editor_scope),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    fix = get_fix(db, pid, fix_id)
    mapping = {
        "title": body.title, "severity": body.severity, "category": body.category,
        "fix_target": body.fixTarget, "symptom": body.symptom, "root_cause": body.rootCause,
        "fix_action": body.fixAction, "changed_files": body.changedFiles,
        "ai_suggestion": body.aiSuggestion, "status": body.status,
    }
    for field, value in mapping.items():
        if value is not None:
            setattr(fix, field, value)
    db.commit()
    return ok(fix_public(fix))


@router.post("/fixes/{fix_id}/regression")
def fix_regression(
    fix_id: str,
    body: RegressionRequest,
    pid: str = Depends(project_editor_scope),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    fix = get_fix(db, pid, fix_id)
    before = get_run(db, pid, fix.before_run_id or fix.run_id)
    after = get_run(db, pid, body.afterRunId)
    comparison = {
        "beforeStatus": before.status,
        "afterStatus": after.status,
        "beforeScore": (before.verdict or {}).get("score"),
        "afterScore": (after.verdict or {}).get("score"),
        "fixed": before.status != "pass" and after.status == "pass",
    }
    fix.after_run_id = after.id
    fix.status = "verified" if after.status == "pass" else "reopened"
    db.commit()
    if fix.status == "verified":
        _write_fix_doc(db, fix, after, before, after)
    return ok({
        "fix": fix_public(fix),
        "before": run_detail(db, before),
        "after": run_detail(db, after),
        "comparison": comparison,
    })


@router.post("/fixes/{fix_id}/generate-doc")
def generate_doc(
    fix_id: str,
    pid: str = Depends(project_editor_scope),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    fix = get_fix(db, pid, fix_id)
    run = get_run(db, pid, fix.after_run_id or fix.before_run_id or fix.run_id)
    before = get_run(db, pid, fix.before_run_id) if fix.before_run_id else None
    after = get_run(db, pid, fix.after_run_id) if fix.after_run_id else None
    _write_fix_doc(db, fix, run, before, after)
    return ok(fix_public(fix))
