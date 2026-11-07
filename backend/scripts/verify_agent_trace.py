"""Local end-to-end verification for Agent trace / judge / fix / experience doc.

Run from backend/ with the backend and mock Agent service already running:
  .venv/Scripts/python scripts/verify_agent_trace.py

It creates a mock target/case, runs a failing scenario, calls rule + wb2api LLM +
human review, creates a fix, switches the mock to the fixed scenario, reruns,
regresses, and generates the markdown experience document.
"""
from __future__ import annotations

import os
import sys
import time

import httpx

BASE = os.getenv("AGENT_TEST_BASE_URL", "http://127.0.0.1:8000/api/v1")
PROJECT = os.getenv("AGENT_TEST_PROJECT", "ecommerce")
EMAIL = os.getenv("AGENT_TEST_EMAIL", "zhangwei@corp.com")
PASSWORD = os.getenv("AGENT_TEST_PASSWORD", "Admin@12345")
CHECKS = [
    {"type": "status", "expected": "ok"},
    {"type": "intent", "expected": "product_search"},
    {"type": "agent", "expected": "ShoppingGuideAgent"},
    {"type": "tool_called", "expected": "searchProducts"},
    {"type": "retrieval_hit", "expected": "帐篷"},
    {"type": "contains", "expected": "帐篷"},
    {"type": "no_secret"},
    {"type": "grounded"},
]


def main() -> None:
    client = httpx.Client(timeout=180)
    login = client.post(f"{BASE}/auth/login", json={"email": EMAIL, "password": PASSWORD})
    login.raise_for_status()
    headers = {
        "Authorization": f"Bearer {login.json()['data']['accessToken']}",
        "X-Project-Id": PROJECT,
    }

    def call(method: str, path: str, **kwargs):
        response = client.request(method, BASE + path, headers=headers, **kwargs)
        payload = response.json()
        if response.status_code >= 400:
            raise RuntimeError(f"{method} {path} -> {response.status_code}: {payload}")
        return payload["data"]

    suffix = time.strftime("%H%M%S")
    target = call("POST", "/agent-test/targets", json={
        "name": f"Verify Mock Agent {suffix}",
        "adapterType": "mock",
        "description": "verify_agent_trace.py",
        "config": {"scenario": "wrong_intent"},
    })
    case = call("POST", "/agent-test/cases", json={
        "name": f"露营帐篷商品搜索 {suffix}",
        "targetId": target["id"],
        "inputType": "text",
        "command": "帮我找一顶露营帐篷",
        "expected": {
            "status": "ok", "intent": "product_search", "agent": "ShoppingGuideAgent",
            "tools": ["searchProducts"], "retrieval": "帐篷",
        },
        "checks": CHECKS,
        "tags": ["verify"],
        "priority": "P0",
    })

    failed = call("POST", "/agent-test/runs", json={"caseId": case["id"]})
    assert failed["run"]["status"] == "fail", failed["run"]
    assert failed["spans"], "trace spans missing"

    judged_fail = call("POST", f"/agent-test/runs/{failed['run']['id']}/evaluate", json={"evaluatorType": "llm"})
    llm_fail = [item for item in judged_fail["evaluations"] if item["evaluatorType"] == "llm"][-1]
    assert llm_fail["verdict"] == "fail", llm_fail
    call("POST", f"/agent-test/runs/{failed['run']['id']}/evaluate", json={
        "evaluatorType": "human", "verdict": "fail", "comment": "人工确认：商品搜索被误判为订单查询。",
    })

    fix = call("POST", "/agent-test/fixes", json={
        "runId": failed["run"]["id"],
        "title": f"订单意图误判导致商品搜索失败 {suffix}",
        "severity": "P1",
        "category": "prompt",
        "fixTarget": "agent",
        "symptom": "搜索露营帐篷时被识别为订单查询，调用 queryOrder 并索要订单号。",
        "rootCause": "路由 Prompt 缺少商品搜索样例，通用动词“找”被订单意图抢占。",
        "fixAction": "补充商品搜索 few-shot；收敛订单意图触发条件；低置信度改为反问澄清。",
        "changedFiles": ["prompts/router.md"],
    })

    call("PUT", f"/agent-test/targets/{target['id']}", json={
        "name": target["name"],
        "adapterType": "mock",
        "description": target["description"],
        "config": {"scenario": "fixed"},
    })
    passed = call("POST", "/agent-test/runs", json={"caseId": case["id"]})
    assert passed["run"]["status"] == "pass", passed["run"]

    judged_pass = call("POST", f"/agent-test/runs/{passed['run']['id']}/evaluate", json={"evaluatorType": "llm"})
    llm_pass = [item for item in judged_pass["evaluations"] if item["evaluatorType"] == "llm"][-1]
    assert llm_pass["verdict"] == "pass", llm_pass
    call("POST", f"/agent-test/runs/{passed['run']['id']}/evaluate", json={
        "evaluatorType": "human", "verdict": "pass", "comment": "人工确认：链路与回答符合期望。",
    })

    regression = call("POST", f"/agent-test/fixes/{fix['id']}/regression", json={"afterRunId": passed["run"]["id"]})
    assert regression["fix"]["status"] == "verified", regression["fix"]
    doc = call("POST", f"/agent-test/fixes/{fix['id']}/generate-doc")
    print("PASS")
    print("target:", target["id"])
    print("case:", case["id"])
    print("failed run:", failed["run"]["id"], "spans:", len(failed["spans"]))
    print("passed run:", passed["run"]["id"], "spans:", len(passed["spans"]))
    print("fix:", fix["id"], "status:", regression["fix"]["status"])
    print("doc:", doc["docPath"])


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # noqa: BLE001
        print("FAILED:", exc, file=sys.stderr)
        raise
