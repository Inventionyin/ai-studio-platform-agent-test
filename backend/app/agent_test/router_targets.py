"""Agent target CRUD routes."""
from __future__ import annotations

from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..auth import get_current_user, project_editor_scope, project_scope
from ..db import get_db
from ..models import AgentRun, AgentTarget, User
from ..response import ok
from ..trace import new_id
from .deps import get_target
from .schemas import TargetCreate, TargetUpdate
from .serializers import target_public

router = APIRouter()


@router.get("/targets")
def list_targets(pid: str = Depends(project_scope), db: Session = Depends(get_db)) -> dict[str, Any]:
    items = db.scalars(
        select(AgentTarget).where(AgentTarget.project_id == pid).order_by(AgentTarget.created_at)
    ).all()
    return ok([target_public(item) for item in items])


@router.post("/targets")
def create_target(
    body: TargetCreate,
    pid: str = Depends(project_editor_scope),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    target = AgentTarget(
        id=new_id("AT"), project_id=pid, name=body.name, adapter_type=body.adapterType,
        description=body.description, config=body.config, status=body.status, created_by=user.id,
    )
    db.add(target)
    db.commit()
    return ok(target_public(target))


@router.put("/targets/{target_id}")
def update_target(
    target_id: str,
    body: TargetUpdate,
    pid: str = Depends(project_editor_scope),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    target = get_target(db, pid, target_id)
    if body.name is not None:
        if not body.name.strip():
            raise HTTPException(400, "目标名称不能为空")
        target.name = body.name.strip()
    mapping = {
        "adapter_type": body.adapterType,
        "description": body.description,
        "config": body.config,
        "status": body.status,
    }
    for field, value in mapping.items():
        if value is not None:
            setattr(target, field, value)
    db.commit()
    return ok(target_public(target))


@router.delete("/targets/{target_id}")
def delete_target(
    target_id: str,
    pid: str = Depends(project_editor_scope),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    target = get_target(db, pid, target_id)
    if db.scalar(select(func.count(AgentRun.id)).where(AgentRun.target_id == target.id)):
        raise HTTPException(400, "目标存在运行记录，无法删除")
    db.delete(target)
    db.commit()
    return ok(None)


@router.post("/targets/{target_id}/health")
def target_health(
    target_id: str,
    pid: str = Depends(project_scope),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    target = get_target(db, pid, target_id)
    config = target.config or {}
    if target.adapter_type == "mock":
        return ok({"ok": True, "detail": "mock adapter ready"})
    if target.adapter_type == "cli":
        ready = bool(config.get("command"))
        return ok({"ok": ready, "detail": "CLI 命令已配置" if ready else "缺少 config.command"})
    if target.adapter_type == "http":
        base_url = str(config.get("baseUrl") or "").rstrip("/")
        if not base_url:
            return ok({"ok": False, "detail": "缺少 config.baseUrl"})
        try:
            response = httpx.get(f"{base_url}/health", timeout=5)
            return ok({"ok": response.status_code < 400, "detail": f"HTTP {response.status_code}"})
        except httpx.HTTPError as exc:
            return ok({"ok": False, "detail": type(exc).__name__})
    return ok({"ok": False, "detail": "暂不支持该适配器健康检查"})
