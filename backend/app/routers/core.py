from __future__ import annotations

import secrets
from datetime import UTC, datetime, timedelta, date
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..auth import (
    ROLE_ADMIN,
    ROLE_DEVELOPER,
    get_current_user,
    hash_password,
    hash_token,
    project_scope,
    require_roles,
    verify_password,
)
from ..config import settings
from ..db import get_db
from ..models import Invite, Project, ProjectMember, RefreshToken, User
from ..response import ok
from ..schemas import (
    ApiKeyCreate, InviteMember, PasswordChange, PermissionsUpdate, ProfileUpdate, RoleUpdate, SkillUpdate,
)
from ..store import store
from .projects import project_public

router = APIRouter()


def must(collection: str, doc_id: str, project_id: str | None = None) -> dict[str, Any]:
    item = store.get(collection, doc_id, project_id)
    if not item:
        raise HTTPException(404, f"{collection} 不存在: {doc_id}")
    return item


def project_ids_for(user: User, db: Session) -> list[Project]:
    if user.role == ROLE_ADMIN:
        return db.scalars(select(Project).where(Project.status != "已归档").order_by(Project.created_at)).all()
    return db.scalars(
        select(Project)
        .join(ProjectMember, ProjectMember.project_id == Project.id)
        .where(ProjectMember.user_id == user.id, Project.status != "已归档")
        .order_by(Project.created_at)
    ).all()


def user_public(user: User, db: Session) -> dict[str, Any]:
    project_count = db.scalar(
        select(func.count(ProjectMember.id)).where(ProjectMember.user_id == user.id)
    ) or 0
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "role": user.role,
        "dept": user.dept,
        "phone": user.phone,
        "title": user.title,
        "bio": user.bio,
        "status": user.status,
        "projectCount": project_count,
        "lastLogin": user.last_login.strftime("%Y-%m-%d %H:%M") if user.last_login else "-",
    }


# ---------------- dashboard ----------------
@router.get("/dashboard")
def dashboard(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    data = store.single("dashboard", {}) or {}
    projects = project_ids_for(user, db)
    return ok({
        **data,
        "projects": [project_public(project, db) for project in projects],
    })


# ---------------- skills ----------------
@router.get("/skills")
def list_skills(kind: str | None = None, _: User = Depends(get_current_user)) -> dict[str, Any]:
    items = store.all("skills")
    if kind:
        items = [item for item in items if item.get("kind") == kind]
    return ok(items)


@router.get("/skills/{skill_id}")
def get_skill(skill_id: str, _: User = Depends(get_current_user)) -> dict[str, Any]:
    return ok(must("skills", skill_id))


@router.post("/skills/{skill_id}/use")
def use_skill(skill_id: str, _: User = Depends(get_current_user)) -> dict[str, Any]:
    skill = must("skills", skill_id)
    skill["calls"] = int(skill.get("calls", 0)) + 1
    store.put("skills", skill_id, skill)
    return ok(skill)


@router.put("/skills/{skill_id}")
def update_skill(
    skill_id: str,
    body: SkillUpdate,
    _: User = Depends(require_roles(ROLE_ADMIN, ROLE_DEVELOPER)),
) -> dict[str, Any]:
    skill = must("skills", skill_id)
    skill.update({key: value for key, value in body.model_dump().items() if value is not None})
    store.put("skills", skill_id, skill)
    return ok(skill)


# ---------------- team ----------------
@router.get("/team/members")
def list_members(
    _: User = Depends(require_roles(ROLE_ADMIN)),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    users = db.scalars(select(User).order_by(User.created_at)).all()
    return ok([user_public(user, db) for user in users])


@router.post("/team/members")
def invite_member(
    body: InviteMember,
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


@router.patch("/team/members/{member_id}")
def update_member_role(
    member_id: str,
    body: RoleUpdate,
    _: User = Depends(require_roles(ROLE_ADMIN)),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    user = db.get(User, member_id)
    if not user:
        raise HTTPException(404, "用户不存在")
    if user.role == ROLE_ADMIN and body.role != ROLE_ADMIN:
        admins = db.scalar(select(func.count(User.id)).where(User.role == ROLE_ADMIN)) or 0
        if admins <= 1:
            raise HTTPException(400, "至少保留一个平台管理员")
    user.role = body.role
    db.commit()
    return ok([user_public(item, db) for item in db.scalars(select(User).order_by(User.created_at)).all()])


@router.delete("/team/members/{member_id}")
def remove_member(
    member_id: str,
    admin: User = Depends(require_roles(ROLE_ADMIN)),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    if member_id == admin.id:
        raise HTTPException(400, "不能删除自己")
    user = db.get(User, member_id)
    if not user:
        raise HTTPException(404, "用户不存在")
    if user.role == ROLE_ADMIN:
        admins = db.scalar(select(func.count(User.id)).where(User.role == ROLE_ADMIN)) or 0
        if admins <= 1:
            raise HTTPException(400, "至少保留一个平台管理员")
    db.delete(user)
    db.commit()
    return ok([user_public(item, db) for item in db.scalars(select(User).order_by(User.created_at)).all()])


@router.get("/team/roles")
def list_roles(_: User = Depends(require_roles(ROLE_ADMIN))) -> dict[str, Any]:
    return ok(store.all("roles"))


@router.put("/team/roles/{name}")
def save_role(
    name: str,
    body: PermissionsUpdate,
    _: User = Depends(require_roles(ROLE_ADMIN)),
) -> dict[str, Any]:
    role = must("roles", name)
    role["permissions"] = body.permissions
    store.put("roles", name, role)
    return ok(store.all("roles"))


# ---------------- profile ----------------
@router.get("/profile")
def get_profile(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    return ok(user_public(user, db))


@router.put("/profile")
def update_profile(
    body: ProfileUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    for key, value in body.model_dump().items():
        if value is not None and hasattr(user, key):
            setattr(user, key, value)
    db.commit()
    return ok(user_public(user, db))


@router.post("/profile/password")
def change_password(
    body: PasswordChange,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    if not verify_password(body.oldPassword, user.password_hash):
        raise HTTPException(400, "当前密码错误")
    if len(body.newPassword) < 8:
        raise HTTPException(400, "新密码至少 8 位")
    user.password_hash = hash_password(body.newPassword)
    db.commit()
    return ok(None)


@router.get("/profile/assets")
def list_assets(user: User = Depends(get_current_user)) -> dict[str, Any]:
    return ok([item for item in store.all("assets") if item.get("userId") in (None, user.id)])


@router.get("/profile/keys")
def list_keys(user: User = Depends(get_current_user)) -> dict[str, Any]:
    return ok([item for item in store.all("apiKeys") if item.get("userId") in (None, user.id)])


@router.post("/profile/keys")
def create_key(body: ApiKeyCreate, user: User = Depends(get_current_user)) -> dict[str, Any]:
    secret = f"ast_live_{secrets.token_urlsafe(24)}"
    record = {
        "id": f"AK-{secrets.token_hex(5)}",
        "name": body.name,
        "prefix": secret[:13],
        "createdAt": date.today().isoformat(),
        "lastUsed": "-",
        "status": "启用",
        "userId": user.id,
    }
    store.put("apiKeys", record["id"], record)
    return ok({"record": record, "secret": secret})


@router.post("/profile/keys/{key_id}/revoke")
def revoke_key(key_id: str, user: User = Depends(get_current_user)) -> dict[str, Any]:
    key = must("apiKeys", key_id)
    if key.get("userId") not in (None, user.id):
        raise HTTPException(403, "无权操作该 Key")
    key["status"] = "停用"
    store.put("apiKeys", key_id, key)
    return ok([item for item in store.all("apiKeys") if item.get("userId") in (None, user.id)])


# ---------------- tasks / versions ----------------
@router.get("/tasks")
def list_tasks(pid: str = Depends(project_scope)) -> dict[str, Any]:
    return ok(store.all("taskHistory", pid))


@router.get("/tasks/{task_id}")
def get_task(task_id: str, pid: str = Depends(project_scope)) -> dict[str, Any]:
    return ok(must("taskHistory", task_id, pid))


@router.get("/versions")
def list_versions(kind: str | None = None, pid: str = Depends(project_scope)) -> dict[str, Any]:
    items = store.all("versions", pid)
    if kind:
        items = [item for item in items if item.get("kind") == kind]
    return ok(items)


@router.get("/versions/compare")
def compare_versions(a: str, b: str, pid: str = Depends(project_scope)) -> dict[str, Any]:
    return ok({"left": must("versions", a, pid), "right": must("versions", b, pid)})
