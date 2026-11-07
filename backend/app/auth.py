from __future__ import annotations

import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any

import bcrypt
import jwt
from fastapi import Cookie, Depends, Header, HTTPException, Request, Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import settings
from .db import get_db
from .models import Project, ProjectMember, RefreshToken, User

bearer = HTTPBearer(auto_error=False)

ROLE_ADMIN = "管理员"
ROLE_DEVELOPER = "开发者"
ROLE_REVIEWER = "评审者"
ROLE_VIEWER = "只读"
VALID_ROLES = {ROLE_ADMIN, ROLE_DEVELOPER, ROLE_REVIEWER, ROLE_VIEWER}


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, hashed: str | None) -> bool:
    if not hashed:
        return False
    try:
        return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))
    except ValueError:
        return False


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def public_user(user: User) -> dict[str, Any]:
    return {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "role": user.role,
        "status": user.status,
        "dept": user.dept,
        "avatar": user.avatar,
    }


def create_access_token(user: User) -> str:
    now = datetime.now(UTC)
    payload = {
        "sub": user.id,
        "role": user.role,
        "type": "access",
        "iat": now,
        "exp": now + timedelta(minutes=settings.access_token_minutes),
    }
    return jwt.encode(payload, settings.app_secret, algorithm="HS256")


def create_oauth_state(provider: str, next_url: str) -> str:
    now = datetime.now(UTC)
    return jwt.encode(
        {"provider": provider, "next": next_url, "type": "oauth", "exp": now + timedelta(minutes=10)},
        settings.app_secret,
        algorithm="HS256",
    )


def parse_oauth_state(state: str) -> dict[str, Any]:
    try:
        payload = jwt.decode(state, settings.app_secret, algorithms=["HS256"])
    except jwt.PyJWTError as exc:
        raise HTTPException(400, "OAuth state 无效或已过期") from exc
    if payload.get("type") != "oauth":
        raise HTTPException(400, "OAuth state 类型错误")
    return payload


def set_refresh_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=settings.cookie_name,
        value=token,
        max_age=settings.refresh_token_days * 24 * 3600,
        httponly=True,
        samesite="lax",
        secure=settings.cookie_secure,
        path=settings.cookie_path,
    )


def clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(settings.cookie_name, path=settings.cookie_path)


def issue_tokens(db: Session, user: User, response: Response) -> str:
    raw = secrets.token_urlsafe(48)
    db.add(
        RefreshToken(
            id=f"RT-{secrets.token_hex(8)}",
            user_id=user.id,
            token_hash=hash_token(raw),
            expires_at=datetime.now(UTC) + timedelta(days=settings.refresh_token_days),
        )
    )
    user.last_login = datetime.now(UTC)
    db.commit()
    set_refresh_cookie(response, raw)
    return create_access_token(user)


def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    if not credentials:
        raise HTTPException(401, "未登录")
    try:
        payload = jwt.decode(credentials.credentials, settings.app_secret, algorithms=["HS256"])
    except jwt.PyJWTError as exc:
        raise HTTPException(401, "登录已过期") from exc
    if payload.get("type") != "access":
        raise HTTPException(401, "Token 类型错误")
    user = db.get(User, payload.get("sub"))
    if not user:
        raise HTTPException(401, "用户不存在")
    if user.status != "启用":
        raise HTTPException(403, "账号已停用")
    request.state.user_id = user.id
    request.state.user_name = user.name
    return user


def require_roles(*roles: str):
    def dependency(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(403, "没有权限执行该操作")
        return user

    return dependency


def project_scope(
    x_project_id: str | None = Header(default=None, alias="X-Project-Id"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> str:
    if not x_project_id:
        raise HTTPException(400, "缺少 X-Project-Id")
    project = db.get(Project, x_project_id)
    if not project or project.status == "已归档":
        raise HTTPException(404, "项目不存在或已归档")
    if user.role != ROLE_ADMIN:
        member = db.scalar(
            select(ProjectMember).where(
                ProjectMember.project_id == x_project_id, ProjectMember.user_id == user.id
            )
        )
        if not member:
            raise HTTPException(403, "不是该项目成员")
    return x_project_id


def project_role(pid: str, user: User, db: Session) -> str:
    if user.role == ROLE_ADMIN:
        return ROLE_ADMIN
    member = db.scalar(
        select(ProjectMember).where(ProjectMember.project_id == pid, ProjectMember.user_id == user.id)
    )
    return member.role if member else ""


def project_editor_scope(
    pid: str = Depends(project_scope),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> str:
    if project_role(pid, user, db) not in {ROLE_ADMIN, ROLE_DEVELOPER}:
        raise HTTPException(403, "需要开发者或管理员权限")
    return pid


def project_reviewer_scope(
    pid: str = Depends(project_scope),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> str:
    if project_role(pid, user, db) not in {ROLE_ADMIN, ROLE_DEVELOPER, ROLE_REVIEWER}:
        raise HTTPException(403, "需要评审者或更高权限")
    return pid


def refresh_session(
    db: Session,
    response: Response,
    token: str | None = Cookie(default=None, alias=settings.cookie_name),
) -> tuple[str, User]:
    if not token:
        raise HTTPException(401, "未登录")
    record = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == hash_token(token)))
    now = datetime.now(UTC)
    if not record or record.revoked or record.expires_at <= now:
        raise HTTPException(401, "会话已失效")
    user = db.get(User, record.user_id)
    if not user or user.status != "启用":
        raise HTTPException(403, "账号不可用")
    record.revoked = True
    db.commit()
    access = issue_tokens(db, user, response)
    return access, user
