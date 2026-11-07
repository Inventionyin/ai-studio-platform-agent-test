from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .audit import audit_middleware
from .agent_test.router import router as agent_test_router
from .config import settings
from .response import ok
from .routers import admin, agent_eval, ai, auth, core, mcp, mcp_connect, projects, skills, testing
from .seed import seed_all

logger = logging.getLogger("ai-test-platform")


@asynccontextmanager
async def lifespan(_: FastAPI):
    seed_all()
    yield


app = FastAPI(title="AI 测试开发平台 API", version="1.0.0", lifespan=lifespan)

app.middleware("http")(audit_middleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for router in (
    auth.router,
    core.router,
    projects.router,
    testing.router,
    ai.router,
    agent_eval.router,
    agent_test_router,
    admin.router,
    mcp.router,
    mcp_connect.router,
    skills.router,
):
    app.include_router(router, prefix="/api/v1")


@app.get("/healthz")
def healthz() -> dict[str, Any]:
    return ok({"status": "ok"})


@app.exception_handler(HTTPException)
async def http_error(_: Request, exc: HTTPException) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={"code": exc.status_code, "message": str(exc.detail), "data": None},
    )


@app.exception_handler(RequestValidationError)
async def validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
    first = exc.errors()[0] if exc.errors() else {}
    location = ".".join(str(part) for part in first.get("loc", []))
    message = f"{location}: {first.get('msg', '参数不合法')}" if location else "参数不合法"
    return JSONResponse(status_code=422, content={"code": 422, "message": message, "data": None})


@app.exception_handler(Exception)
async def unhandled_error(_: Request, exc: Exception) -> JSONResponse:
    logger.exception("unhandled error: %s", exc)
    return JSONResponse(status_code=500, content={"code": 500, "message": "服务器内部错误", "data": None})
