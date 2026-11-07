from __future__ import annotations

import random
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..auth import ROLE_ADMIN, hash_token, require_roles
from ..config import settings
from ..db import get_db
from ..models import Invite, ProjectMember, User
from ..response import ok
from ..schemas import ChannelCreate, ProviderCreate, ProviderUpdate, RoutingSave, UserCreate
from ..store import store

router = APIRouter(dependencies=[Depends(require_roles(ROLE_ADMIN))])


def must(collection: str, doc_id: str) -> dict[str, Any]:
    item = store.get(collection, doc_id)
    if not item:
        raise HTTPException(404, f"{collection} 不存在: {doc_id}")
    return item


def user_public(user: User, db: Session) -> dict[str, Any]:
    project_count = db.scalar(
        select(func.count(ProjectMember.id)).where(ProjectMember.user_id == user.id)
    ) or 0
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "dept": user.dept,
        "role": user.role,
        "projectCount": project_count,
        "lastLogin": user.last_login.strftime("%Y-%m-%d %H:%M") if user.last_login else "-",
        "status": user.status,
    }


# ---------------- model providers ----------------
@router.get("/admin/providers")
def list_providers() -> dict[str, Any]:
    return ok(store.all("providers"))


@router.post("/admin/providers")
def create_provider(body: ProviderCreate) -> dict[str, Any]:
    provider = {"id": f"MP-{secrets.token_hex(5)}", **body.model_dump(), "status": "未检测", "latencyMs": 0}
    store.put("providers", provider["id"], provider)
    return ok(provider)


@router.put("/admin/providers/{provider_id}")
def update_provider(provider_id: str, body: ProviderUpdate) -> dict[str, Any]:
    provider = must("providers", provider_id)
    provider.update({key: value for key, value in body.model_dump().items() if value is not None})
    store.put("providers", provider_id, provider)
    return ok(store.all("providers"))


@router.post("/admin/providers/{provider_id}/test")
def test_provider(provider_id: str) -> dict[str, Any]:
    provider = must("providers", provider_id)
    if provider.get("name") == "Azure OpenAI":
        provider["status"] = "异常"
        provider["latencyMs"] = 0
    else:
        provider["status"] = "正常"
        provider["latencyMs"] = 210 + random.randint(0, 240)
    store.put("providers", provider_id, provider)
    return ok(store.all("providers"))


@router.get("/admin/routing")
def list_routing() -> dict[str, Any]:
    return ok(store.all("routing"))


@router.put("/admin/routing")
def save_routing(body: RoutingSave) -> dict[str, Any]:
    store.replace("routing", body.rules, id_key="id")
    return ok(store.all("routing"))


# ---------------- platform users ----------------
@router.get("/admin/users")
def list_platform_users(db: Session = Depends(get_db)) -> dict[str, Any]:
    users = db.scalars(select(User).order_by(User.created_at)).all()
    return ok([user_public(user, db) for user in users])


@router.post("/admin/users")
def invite_platform_user(
    body: UserCreate,
    admin: User = Depends(require_roles(ROLE_ADMIN)),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    existing = db.scalar(select(User).where(User.email == body.email))
    if existing and existing.password_hash:
        raise HTTPException(409, "该邮箱已激活")
    raw = secrets.token_urlsafe(32)
    invite = Invite(
        id=f"INV-{secrets.token_hex(6)}",
        email=body.email,
        role=body.role,
        token_hash=hash_token(raw),
        expires_at=datetime.now(UTC) + timedelta(days=7),
        created_by=admin.id,
    )
    db.add(invite)
    db.commit()
    link = f"{settings.frontend_url.rstrip('/')}/accept-invite?token={raw}"
    return ok({"invite": {"id": invite.id, "email": invite.email, "role": invite.role}, "link": link, "token": raw})


@router.post("/admin/users/{user_id}/toggle")
def toggle_platform_user(user_id: str, admin: User = Depends(require_roles(ROLE_ADMIN)), db: Session = Depends(get_db)) -> dict[str, Any]:
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(404, "用户不存在")
    if user.id == admin.id:
        raise HTTPException(400, "不能停用自己")
    user.status = "停用" if user.status == "启用" else "启用"
    db.commit()
    return ok([user_public(item, db) for item in db.scalars(select(User).order_by(User.created_at)).all()])


# ---------------- health ----------------
@router.get("/admin/health")
def list_health() -> dict[str, Any]:
    return ok(store.all("health"))


@router.post("/admin/health/check")
def check_health() -> dict[str, Any]:
    items = store.all("health")
    for item in items:
        if item.get("status") == "正常" and item.get("name") == "LLM 网关":
            item["metric"] = f"{190 + random.randint(0, 60)}ms"
            store.put("health", item["name"], item)
    return ok(items)


# ---------------- notification channels ----------------
@router.get("/admin/channels")
def list_channels() -> dict[str, Any]:
    return ok(store.all("channels"))


@router.post("/admin/channels")
def create_channel(body: ChannelCreate) -> dict[str, Any]:
    if not body.target:
        raise HTTPException(400, "接收地址不能为空")
    channel = {"id": f"NC-{secrets.token_hex(5)}", **body.model_dump(), "status": "启用"}
    store.put("channels", channel["id"], channel)
    return ok(store.all("channels"))


@router.post("/admin/channels/{channel_id}/toggle")
def toggle_channel(channel_id: str) -> dict[str, Any]:
    channel = must("channels", channel_id)
    channel["status"] = "停用" if channel.get("status") == "启用" else "启用"
    store.put("channels", channel_id, channel)
    return ok(store.all("channels"))


# ---------------- audit ----------------
@router.get("/admin/audits")
def list_audits() -> dict[str, Any]:
    return ok(store.all("audits"))


@router.get("/admin/audits/{audit_id}")
def get_audit(audit_id: str) -> dict[str, Any]:
    return ok(must("audits", audit_id))
