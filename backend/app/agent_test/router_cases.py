"""Agent test case CRUD routes."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..auth import get_current_user, project_editor_scope, project_scope
from ..db import get_db
from ..models import AgentRun, AgentTestCase, User
from ..response import ok
from ..trace import new_id
from .deps import get_case, get_target
from .schemas import CaseCreate, CaseUpdate
from .serializers import case_public

router = APIRouter()


@router.get("/cases")
def list_cases(pid: str = Depends(project_scope), db: Session = Depends(get_db)) -> dict[str, Any]:
    items = db.scalars(
        select(AgentTestCase).where(AgentTestCase.project_id == pid).order_by(AgentTestCase.created_at)
    ).all()
    return ok([case_public(item) for item in items])


@router.post("/cases")
def create_case(
    body: CaseCreate,
    pid: str = Depends(project_editor_scope),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    if body.targetId:
        get_target(db, pid, body.targetId)
    case = AgentTestCase(
        id=new_id("AC"), project_id=pid, target_id=body.targetId, name=body.name,
        input_type=body.inputType, command=body.command, turns=body.turns, payload=body.payload,
        expected=body.expected, checks=body.checks, tags=body.tags, priority=body.priority,
        enabled=body.enabled, version=body.version, created_by=user.id,
    )
    db.add(case)
    db.commit()
    return ok(case_public(case))


@router.put("/cases/{case_id}")
def update_case(
    case_id: str,
    body: CaseUpdate,
    pid: str = Depends(project_editor_scope),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    case = get_case(db, pid, case_id)
    if body.targetId is not None:
        get_target(db, pid, body.targetId)
        case.target_id = body.targetId
    mapping = {
        "name": body.name, "input_type": body.inputType, "command": body.command,
        "turns": body.turns, "payload": body.payload, "expected": body.expected, "checks": body.checks,
        "tags": body.tags, "priority": body.priority, "enabled": body.enabled,
        "version": body.version,
    }
    for field, value in mapping.items():
        if value is not None:
            setattr(case, field, value)
    db.commit()
    return ok(case_public(case))


@router.delete("/cases/{case_id}")
def delete_case(
    case_id: str,
    pid: str = Depends(project_editor_scope),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    case = get_case(db, pid, case_id)
    if db.scalar(select(func.count(AgentRun.id)).where(AgentRun.case_id == case.id)):
        raise HTTPException(400, "用例存在运行记录，无法删除")
    db.delete(case)
    db.commit()
    return ok(None)
