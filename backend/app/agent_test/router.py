"""Agent 全链路追踪 API router assembly."""
from __future__ import annotations

from fastapi import APIRouter

from .router_cases import router as cases_router
from .router_docs import router as docs_router
from .router_fixes import router as fixes_router
from .router_runs import router as runs_router
from .router_targets import router as targets_router

router = APIRouter(prefix="/agent-test", tags=["agent-test"])
router.include_router(targets_router)
router.include_router(cases_router)
router.include_router(runs_router)
router.include_router(fixes_router)
router.include_router(docs_router)
