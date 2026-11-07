from __future__ import annotations

from fastapi import Request

from .logic import now_label, uid
from .store import store

MUTATING = {"POST", "PUT", "PATCH", "DELETE"}


async def audit_middleware(request: Request, call_next):
    response = await call_next(request)
    try:
        path = request.url.path
        if (
            request.method in MUTATING
            and path.startswith("/api/v1/")
            and not path.startswith("/api/v1/auth/")
            and not path.endswith("/knowledge/recall")
        ):
            user_id = getattr(request.state, "user_id", None)
            if user_id:
                project_id = request.headers.get("X-Project-Id") or ""
                store.put("audits", uid("AL"), {
                    "id": uid("AL"),
                    "time": now_label(),
                    "operator": getattr(request.state, "user_name", ""),
                    "action": f"{request.method} {path}",
                    "target": path.rstrip("/").split("/")[-1],
                    "tokens": "-",
                    "ip": request.client.host if request.client else "",
                    "projectId": project_id,
                    "detail": {"status": response.status_code, "projectId": project_id},
                })
    except Exception:  # noqa: BLE001 - audit must never break the response
        pass
    return response
