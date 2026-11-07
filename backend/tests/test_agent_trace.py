from __future__ import annotations

import json
import time
from pathlib import Path

from app.config import settings

BASE = "/api/v1/agent-test"

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


def _create_target(app_client, headers, scenario: str, name: str = "Mock 购物 Agent") -> dict:
    response = app_client.post(
        f"{BASE}/targets",
        headers=headers,
        json={
            "name": name,
            "adapterType": "mock",
            "description": "pytest mock target",
            "config": {
                "scenario": scenario,
                "headers": {"Authorization": "Bearer supersecret-token-123"},
            },
        },
    )
    assert response.status_code == 200, response.text
    return response.json()["data"]


def _create_case(app_client, headers, target_id: str) -> dict:
    response = app_client.post(
        f"{BASE}/cases",
        headers=headers,
        json={
            "name": "帐篷商品搜索",
            "targetId": target_id,
            "inputType": "text",
            "command": "帮我找一顶露营帐篷",
            "expected": {
                "status": "ok",
                "intent": "product_search",
                "agent": "ShoppingGuideAgent",
                "tools": ["searchProducts"],
                "retrieval": "帐篷",
            },
            "checks": CHECKS,
            "tags": ["smoke", "trace"],
            "priority": "P0",
        },
    )
    assert response.status_code == 200, response.text
    return response.json()["data"]


def _invite_user(app_client, admin_headers, role: str) -> dict[str, str]:
    suffix = time.time_ns()
    email = f"trace-{role}-{suffix}@corp.com"
    invite = app_client.post(
        "/api/v1/auth/invites",
        headers={"Authorization": admin_headers["Authorization"]},
        json={"email": email, "role": role},
    )
    assert invite.status_code == 200, invite.text
    accepted = app_client.post(
        "/api/v1/auth/invites/accept",
        json={"token": invite.json()["data"]["token"], "name": f"trace {role}", "password": "Passw0rd!"},
    )
    assert accepted.status_code == 200, accepted.text
    return {
        "Authorization": f"Bearer {accepted.json()['data']['accessToken']}",
        "X-Project-Id": "ecommerce",
    }


def test_agent_trace_full_flow(app_client, admin_headers, monkeypatch, tmp_path) -> None:
    from app.agent_test.evaluators import call_judge_model as real_judge_model
    target = _create_target(app_client, admin_headers, "wrong_intent")
    case = _create_case(app_client, admin_headers, target["id"])

    failed_response = app_client.post(f"{BASE}/runs", headers=admin_headers, json={"caseId": case["id"]})
    assert failed_response.status_code == 200, failed_response.text
    failed = failed_response.json()["data"]
    assert failed["run"]["status"] == "fail"
    assert failed["run"]["traceId"]
    assert failed["spans"], "trace spans should be persisted"
    span_types = {span["spanType"] for span in failed["spans"]}
    assert {"command", "agent", "llm", "tool", "final"} <= span_types
    assert any(item["evaluatorType"] == "rule" and item["verdict"] == "fail" for item in failed["evaluations"])

    serialized = json.dumps(failed["spans"], ensure_ascii=False)
    assert "supersecret-token-123" not in serialized
    command_span = next(span for span in failed["spans"] if span["spanType"] == "command")
    assert command_span["input"]["headers"]["Authorization"] == "[REDACTED]"

    fix_response = app_client.post(
        f"{BASE}/fixes",
        headers=admin_headers,
        json={
            "runId": failed["run"]["id"],
            "title": "意图识别错误导致答非所问",
            "severity": "P1",
            "category": "prompt",
            "fixTarget": "agent",
            "symptom": "用户搜索帐篷时被路由到订单 Agent。",
            "rootCause": "路由 Prompt 缺少商品搜索样例。",
            "fixAction": "补充商品搜索意图样例并回归。",
            "changedFiles": ["prompts/router.md"],
        },
    )
    assert fix_response.status_code == 200, fix_response.text
    fix = fix_response.json()["data"]
    assert fix["slug"]

    updated = app_client.put(
        f"{BASE}/targets/{target['id']}",
        headers=admin_headers,
        json={
            "name": target["name"],
            "adapterType": "mock",
            "config": {
                "scenario": "fixed",
                "headers": {"Authorization": "Bearer supersecret-token-123"},
            },
        },
    )
    assert updated.status_code == 200, updated.text

    passed_response = app_client.post(f"{BASE}/runs", headers=admin_headers, json={"caseId": case["id"]})
    assert passed_response.status_code == 200, passed_response.text
    passed = passed_response.json()["data"]
    assert passed["run"]["status"] == "pass", passed["run"]
    assert passed["run"]["verdict"]["verdict"] == "pass"

    monkeypatch.setattr(settings, "fix_doc_dir", str(tmp_path), raising=False)
    regression_response = app_client.post(
        f"{BASE}/fixes/{fix['id']}/regression",
        headers=admin_headers,
        json={"afterRunId": passed["run"]["id"]},
    )
    assert regression_response.status_code == 200, regression_response.text
    regression = regression_response.json()["data"]
    assert regression["comparison"]["fixed"] is True
    assert regression["fix"]["status"] == "verified"
    assert regression["fix"]["docPath"], "regression should auto-generate the experience document"
    assert regression["before"]["run"]["id"] == failed["run"]["id"]
    assert regression["after"]["run"]["id"] == passed["run"]["id"]

    doc = regression["fix"]
    assert doc["docPath"]
    doc_path = Path(doc["docPath"])
    assert doc_path.exists()
    content = doc_path.read_text(encoding="utf-8")
    for section in ["基本信息", "问题现象", "复现方式", "链路追踪", "根因分析", "修复方案", "回归验证", "经验总结", "附件"]:
        assert section in content
    assert doc_path.name == f"v1.0---{doc['slug']}-fix经验积累.md"

    append_response = app_client.post(f"{BASE}/fixes/{fix['id']}/generate-doc", headers=admin_headers)
    assert append_response.status_code == 200
    assert "## 修复轮次 2" in Path(append_response.json()["data"]["docPath"]).read_text(encoding="utf-8")

    monkeypatch.setattr(settings, "judge_api_key", "test-judge-key", raising=False)
    monkeypatch.setattr(settings, "judge_base_url", "http://judge.local/v1", raising=False)

    def fake_judge(system: str, _user: str):
        assert "Agent 测试评审器" in system
        return (
            {
                "verdict": "pass",
                "score": 0.92,
                "reasons": ["回答与工具、检索证据一致"],
                "evidence": ["牧高笛双层帐篷"],
                "missing_facts": [],
                "hallucination": False,
            },
            '{"verdict":"pass","score":0.92}',
        )

    monkeypatch.setattr("app.agent_test.evaluators.call_judge_model", fake_judge)
    judge_response = app_client.post(
        f"{BASE}/runs/{passed['run']['id']}/evaluate",
        headers=admin_headers,
        json={"evaluatorType": "llm"},
    )
    assert judge_response.status_code == 200, judge_response.text
    judgments = judge_response.json()["data"]["evaluations"]
    assert any(item["evaluatorType"] == "llm" and item["verdict"] == "pass" for item in judgments)
    assert judge_response.json()["data"]["run"]["status"] == "pass"
    judged_detail = app_client.get(f"{BASE}/runs/{passed['run']['id']}", headers=admin_headers).json()["data"]
    assert any(span["spanType"] == "judge" for span in judged_detail["spans"])

    def fake_chinese_judge(_system: str, _user: str):
        return (
            {"判定": "不通过", "问题类型": "意图识别与路由错误", "原因": "回答与证据不一致", "分数": 30},
            '{"判定":"不通过","原因":"回答与证据不一致"}',
        )

    monkeypatch.setattr("app.agent_test.evaluators.call_judge_model", fake_chinese_judge)
    chinese_response = app_client.post(
        f"{BASE}/runs/{passed['run']['id']}/evaluate",
        headers=admin_headers,
        json={"evaluatorType": "llm"},
    )
    assert chinese_response.status_code == 200, chinese_response.text
    chinese_data = chinese_response.json()["data"]
    latest_llm = [item for item in chinese_data["evaluations"] if item["evaluatorType"] == "llm"][-1]
    assert latest_llm["verdict"] == "fail"
    assert latest_llm["score"] == 0.3
    assert chinese_data["run"]["status"] == "fail"

    class BadJudgeResponse:
        status_code = 200
        text = ""

        @staticmethod
        def json():
            return {"choices": [{"message": {"content": "抱歉，无法输出 JSON"}}]}

    monkeypatch.setattr("app.agent_test.evaluators.call_judge_model", real_judge_model)
    monkeypatch.setattr("app.agent_test.evaluators.httpx.post", lambda *args, **kwargs: BadJudgeResponse())
    bad_response = app_client.post(
        f"{BASE}/runs/{passed['run']['id']}/evaluate",
        headers=admin_headers,
        json={"evaluatorType": "llm"},
    )
    assert bad_response.status_code == 200, bad_response.text
    bad_data = bad_response.json()["data"]
    bad_llm = [item for item in bad_data["evaluations"] if item["evaluatorType"] == "llm"][-1]
    assert bad_llm["verdict"] == "unavailable"
    assert bad_llm["response"] == "抱歉，无法输出 JSON"
    assert bad_data["run"]["status"] == "needs_review"
    bad_detail = app_client.get(f"{BASE}/runs/{passed['run']['id']}", headers=admin_headers).json()["data"]
    assert any(
        span["spanType"] == "judge" and span["output"].get("raw") == "抱歉，无法输出 JSON"
        for span in bad_detail["spans"]
    )

    summary = app_client.get(f"{BASE}/summary", headers=admin_headers)
    assert summary.status_code == 200
    assert summary.json()["data"]["targets"] >= 1
    assert summary.json()["data"]["runs"] >= 2
    assert 0 <= summary.json()["data"]["passRate"] <= 1

    assert app_client.get(f"{BASE}/targets").status_code == 401
    outsider_headers = _invite_user(app_client, admin_headers, "开发者")
    assert app_client.get(f"{BASE}/targets", headers=outsider_headers).status_code == 403
    viewer_headers = _invite_user(app_client, admin_headers, "只读")
    viewer_id = app_client.get("/api/v1/auth/me", headers={"Authorization": viewer_headers["Authorization"]}).json()["data"]["id"]
    assigned = app_client.post(
        "/api/v1/projects/ecommerce/members",
        headers=admin_headers,
        json={"userId": viewer_id, "role": "只读"},
    )
    assert assigned.status_code == 200, assigned.text
    assert app_client.post(
        f"{BASE}/targets",
        headers=viewer_headers,
        json={"name": "forbidden", "adapterType": "mock"},
    ).status_code == 403


def test_judge_payload_normalization() -> None:
    from app.agent_test.evaluators import normalize_judge_payload

    failed = normalize_judge_payload({"判定": "不通过", "原因": "意图识别错误", "分数": 30})
    assert failed["verdict"] == "fail"
    assert failed["score"] == 0.3
    assert failed["reasons"] == ["意图识别错误"]

    passed = normalize_judge_payload({"结论": "通过", "得分": "90%", "证据": ["工具返回"]})
    assert passed["verdict"] == "pass"
    assert passed["score"] == 0.9
    assert passed["evidence"] == ["工具返回"]

    assert normalize_judge_payload({"结果": "待复核"})["verdict"] == "needs_review"
    assert normalize_judge_payload({"原因": "回答包含错误事实，判定失败"})["verdict"] == "fail"
    assert normalize_judge_payload({"判定": "正确"})["verdict"] == "pass"


def test_execute_run_catches_unexpected_error(app_client, admin_headers, monkeypatch) -> None:
    target = _create_target(app_client, admin_headers, "success", name=f"异常目标-{time.time_ns()}")
    case = _create_case(app_client, admin_headers, target["id"])

    def boom(*_args, **_kwargs):
        raise RuntimeError("boom")

    monkeypatch.setattr("app.agent_test.service.run_target", boom)
    response = app_client.post(f"{BASE}/runs", headers=admin_headers, json={"caseId": case["id"]})
    assert response.status_code == 200, response.text
    detail = response.json()["data"]
    assert detail["run"]["status"] == "error"
    assert "boom" in detail["run"]["error"]
    assert any(span["status"] == "error" for span in detail["spans"])
