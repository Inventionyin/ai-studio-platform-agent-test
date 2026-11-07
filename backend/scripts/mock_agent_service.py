"""Standalone mock Agent service for local Agent trace testing (port 8088)."""
from __future__ import annotations

import time
import uuid
from pathlib import Path
import sys
from typing import Any

import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.agent_test.adapters import build_mock_trace

app = FastAPI(title="Mock Agent Service", version="1.0.0")
RUNS: dict[str, dict[str, Any]] = {}

REPORTS = [
    {"name": "rule", "label": "规则评测", "exists": True, "case_count": 8, "llm": ""},
    {"name": "real", "label": "真实模型评测", "exists": True, "case_count": 8, "llm": "deepseek-v4.1-flash"},
]


class ChatRequest(BaseModel):
    message: str = ""
    scenario: str = "success"
    payload: dict[str, Any] = Field(default_factory=dict)


@app.get("/health")
def health() -> dict[str, Any]:
    return {"status": "UP", "service": "mock-agent"}


@app.post("/agent/chat")
def chat(body: ChatRequest) -> Any:
    scenario = body.scenario or "success"
    if scenario == "malformed":
        return PlainTextResponse("this-is-not-json", status_code=200)
    if scenario == "timeout":
        time.sleep(3)
    run_id = f"run-{uuid.uuid4().hex[:12]}"
    trace = build_mock_trace(scenario, body.message, run_id=run_id)
    RUNS[run_id] = trace
    return {
        "run_id": run_id,
        "trace_id": trace.get("trace_id"),
        "session_id": f"session-{run_id}",
        "intent": trace.get("intent"),
        "agent": trace.get("agent"),
        "status": trace.get("status"),
        "answer": trace.get("answer"),
        "tools": [item.get("name") for item in trace.get("tool_calls") or []],
        "latency_ms": trace.get("latency_ms"),
    }


@app.get("/agent/runs")
def list_runs() -> list[dict[str, Any]]:
    return [
        {
            "run_id": run_id,
            "trace_id": trace.get("trace_id"),
            "status": trace.get("status"),
            "intent": trace.get("intent"),
            "agent": trace.get("agent"),
            "answer": trace.get("answer"),
        }
        for run_id, trace in list(RUNS.items())[-50:]
    ]


@app.get("/agent/runs/{run_id}")
def get_run(run_id: str) -> dict[str, Any]:
    trace = RUNS.get(run_id)
    if not trace:
        raise HTTPException(404, "run not found")
    return trace


@app.get("/eval/reports")
def list_reports() -> list[dict[str, Any]]:
    return REPORTS


@app.get("/eval/reports/{name}")
def get_report(name: str) -> dict[str, Any]:
    for report in REPORTS:
        if report["name"] == name:
            return {
                **report,
                "summary": {"pass": 6, "fail": 2, "pass_rate": 0.75},
                "cases": [
                    {"name": "商品搜索链路", "status": "pass"},
                    {"name": "知识库 RAG 链路", "status": "pass"},
                    {"name": "订单鉴权边界", "status": "pass"},
                    {"name": "退款时效回答", "status": "fail"},
                ],
            }
    raise HTTPException(404, "report not found")


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8088)
