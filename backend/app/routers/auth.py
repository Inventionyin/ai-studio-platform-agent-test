from __future__ import annotations

import secrets
from datetime import UTC, datetime, timedelta
from typing import Any
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Cookie, Depends, HTTPException, Response
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import (
    ROLE_ADMIN,
    create_oauth_state,
    get_current_user,
    hash_password,
    hash_token,
    issue_tokens,
    parse_oauth_state,
    public_user,
    refresh_session,
    require_roles,
    set_refresh_cookie,
    clear_refresh_cookie,
    verify_password,
)
from ..config import settings
from ..db import get_db
from ..models import Invite, RefreshToken, User
from ..response import ok
from ..schemas import InviteAccept, InviteCreate, LoginRequest

router = APIRouter(prefix="/auth", tags=["auth"])


def oauth_redirect_uri(provider: str) -> str:
    return f"{settings.frontend_url.rstrip('/')}/api/v1/auth/oauth/{provider}/callback"


@router.post("/login")
def login(body: LoginRequest, response: Response, db: Session = Depends(get_db)) -> dict[str, Any]:
    user = db.scalar(select(User).where(User.email == body.email))
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "邮箱或密码错误")
    if user.status != "启用":
        raise HTTPException(403, "账号已停用")
    token = issue_tokens(db, user, response)
    return ok({"accessToken": token, "user": public_user(user)})


@router.post("/refresh")
def refresh(
    response: Response,
    db: Session = Depends(get_db),
    token: str | None = Cookie(default=None, alias=settings.cookie_name),
) -> dict[str, Any]:
    access, user = refresh_session(db, response, token)
    return ok({"accessToken": access, "user": public_user(user)})


@router.post("/logout")
def logout(
    response: Response,
    db: Session = Depends(get_db),
    token: str | None = Cookie(default=None, alias=settings.cookie_name),
) -> dict[str, Any]:
    if token:
        record = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == hash_token(token)))
        if record:
            record.revoked = True
            db.commit()
    clear_refresh_cookie(response)
    return ok(None)


@router.get("/me")
def me(user: User = Depends(get_current_user)) -> dict[str, Any]:
    return ok(public_user(user))


@router.post("/invites")
def create_invite(
    body: InviteCreate,
    user: User = Depends(require_roles(ROLE_ADMIN)),
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
        created_by=user.id,
    )
    db.add(invite)
    db.commit()
    link = f"{settings.frontend_url.rstrip('/')}/accept-invite?token={raw}"
    return ok({"id": invite.id, "email": invite.email, "role": invite.role, "token": raw, "link": link})


@router.get("/invites")
def list_invites(
    _: User = Depends(require_roles(ROLE_ADMIN)),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    items = db.scalars(select(Invite).order_by(Invite.created_at.desc())).all()
    return ok([
        {"id": item.id, "email": item.email, "role": item.role, "status": item.status, "expiresAt": item.expires_at}
        for item in items
    ])


@router.post("/invites/accept")
def accept_invite(body: InviteAccept, response: Response, db: Session = Depends(get_db)) -> dict[str, Any]:
    invite = db.scalar(select(Invite).where(Invite.token_hash == hash_token(body.token)))
    if not invite or invite.status != "待接受":
        raise HTTPException(400, "邀请无效")
    if invite.expires_at <= datetime.now(UTC):
        raise HTTPException(400, "邀请已过期")
    user = db.scalar(select(User).where(User.email == invite.email))
    if user and user.password_hash:
        raise HTTPException(409, "该邮箱已激活")
    if user:
        user.name = body.name
        user.password_hash = hash_password(body.password)
        user.role = invite.role
        user.status = "启用"
    else:
        user = User(
            id=f"U-{secrets.token_hex(6)}",
            email=invite.email,
            name=body.name,
            password_hash=hash_password(body.password),
            role=invite.role,
            status="启用",
            dept="",
        )
        db.add(user)
    invite.status = "已接受"
    db.flush()
    access = issue_tokens(db, user, response)
    return ok({"accessToken": access, "user": public_user(user)})


# ---------------- OAuth / OIDC ----------------
@router.get("/oauth/providers")
def oauth_providers() -> dict[str, Any]:
    return ok([{"id": key, "name": value.get("name", key)} for key, value in settings.oauth_providers.items()])


@router.get("/oauth/{provider}/authorize")
def oauth_authorize(provider: str) -> RedirectResponse:
    config = settings.oauth_providers.get(provider)
    if not config:
        raise HTTPException(404, "OAuth 供应商未配置")
    state = create_oauth_state(provider, "/")
    query = urlencode({
        "client_id": config["client_id"],
        "redirect_uri": oauth_redirect_uri(provider),
        "response_type": "code",
        "scope": config.get("scope", "openid email profile"),
        "state": state,
    })
    return RedirectResponse(f"{config['authorize_url']}?{query}")


@router.get("/oauth/{provider}/callback")
def oauth_callback(provider: str, code: str, state: str, db: Session = Depends(get_db)) -> RedirectResponse:
    config = settings.oauth_providers.get(provider)
    if not config:
        raise HTTPException(404, "OAuth 供应商未配置")
    payload = parse_oauth_state(state)
    if payload.get("provider") != provider:
        raise HTTPException(400, "OAuth state 供应商不匹配")

    with httpx.Client(timeout=20) as client:
        token_response = client.post(config["token_url"], data={
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": oauth_redirect_uri(provider),
            "client_id": config["client_id"],
            "client_secret": config["client_secret"],
        })
        if token_response.status_code >= 400:
            raise HTTPException(400, "OAuth 换取 Token 失败")
        access_token = token_response.json().get("access_token")
        userinfo_response = client.get(config["userinfo_url"], headers={"Authorization": f"Bearer {access_token}"})
        if userinfo_response.status_code >= 400:
            raise HTTPException(400, "OAuth 获取用户信息失败")
        info = userinfo_response.json()

    email = info.get("email") or info.get("preferred_username")
    subject = str(info.get("sub") or "")
    if not email:
        raise HTTPException(400, "OAuth 未返回邮箱")
    user = db.scalar(select(User).where(User.email == email))
    if not user:
        domains = config.get("allowed_domains") or []
        domain = email.split("@")[-1]
        if domains and domain not in domains:
            raise HTTPException(403, "该邮箱域不允许登录")
        user = User(
            id=f"U-{secrets.token_hex(6)}",
            email=email,
            name=info.get("name") or email,
            password_hash=None,
            role=settings.oauth_default_role,
            status="启用",
            dept="",
            oauth_provider=provider,
            oauth_subject=subject,
        )
        db.add(user)
    else:
        user.oauth_provider = provider
        user.oauth_subject = subject
    db.commit()

    raw = secrets.token_urlsafe(48)
    db.add(RefreshToken(
        id=f"RT-{secrets.token_hex(8)}",
        user_id=user.id,
        token_hash=hash_token(raw),
        expires_at=datetime.now(UTC) + timedelta(days=settings.refresh_token_days),
    ))
    db.commit()
    redirect = RedirectResponse(f"{settings.frontend_url.rstrip('/')}/?oauth=1")
    set_refresh_cookie(redirect, raw)
    return redirect
