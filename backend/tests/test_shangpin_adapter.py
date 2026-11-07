from __future__ import annotations

import json
import socket
import threading
import time
from pathlib import Path

import pytest

from app.agent_test.adapters import AdapterError, run_target
from app.agent_test.rules import evaluate_rules
from app.agent_test.shangpin import parse_sse

ROOT = Path(__file__).resolve().parents[1]
GOLDEN_PATH = ROOT / "scripts" / "data" / "shangpin_golden.json"

SSE_SAMPLE = """event: reasoning
data: {"delta": "先理解问题，"}

event: reasoning
data: {"delta": "再检索商品"}

event: delta
data: {"delta": "为您推荐 "}

event: delta
data: {"delta": "Redmi K70"}

event: cards
data: {"items": [{"spuId": "104", "name": "Redmi K70 12+256G", "price": 2299}]}

event: action
data: {"actionId": 1, "tool": "add_to_cart", "summary": "加入购物车"}

event: done
data: {"messageId": 9, "sessionStatus": "AI_ONGOING", "degraded": false, "sources": [{"source": "retrieval:vector"}, "product:104"], "tokens": {"prompt": 100, "completion": 50}, "runId": 123, "agent": "SHOPPING_GUIDE", "intent": "PRODUCT_SEARCH", "tools": ["search_products"]}
"""


def test_parse_sse_events() -> None:
    parsed = parse_sse(SSE_SAMPLE)
    assert parsed["reasoning"] == "先理解问题，再检索商品"
    assert parsed["answer"] == "为您推荐 Redmi K70"
    assert parsed["cards"] == [{"spuId": "104", "name": "Redmi K70 12+256G", "price": 2299}]
    assert parsed["sources"] == ["retrieval:vector", "product:104"]
    assert parsed["tokens"] == {"prompt": 100, "completion": 50}
    assert parsed["degraded"] is False
    assert parsed["runId"] == 123
    assert parsed["agent"] == "SHOPPING_GUIDE"
    assert parsed["intent"] == "PRODUCT_SEARCH"
    assert parsed["tools"] == ["search_products"]
    assert parsed["sessionStatus"] == "AI_ONGOING"
    assert parsed["actions"][0]["tool"] == "add_to_cart"
    assert parsed["error"] is None

    failed = parse_sse('event: error\ndata: {"code": 500, "msg": "boom"}\n\n')
    assert failed["error"] == {"code": 500, "msg": "boom"}


@pytest.fixture(scope="module")
def shangpin_base_url():
    import uvicorn

    from tests.fixtures.mock_shangpin_service import create_app

    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    sock.close()
    server = uvicorn.Server(uvicorn.Config(create_app(), host="127.0.0.1", port=port, log_level="error"))
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    deadline = time.time() + 10
    while not server.started and time.time() < deadline:
        time.sleep(0.05)
    if not server.started:
        pytest.fail("mock Shang Pivot 服务启动失败")
    yield f"http://127.0.0.1:{port}"
    server.should_exit = True
    thread.join(timeout=5)


def _config(base_url: str) -> dict:
    return {
        "baseUrl": base_url,
        "customerPhones": ["13900009999", "13900009998"],
        "smsCode": "123456",
        "clientType": "h5",
        "throttleMs": 0,
        "rateLimitWaitSeconds": 0,
        "cartCleanup": True,
        "engine": "legacy",
    }


def test_shangpin_multi_turn_conversation_and_cart_state(shangpin_base_url: str) -> None:
    result = run_target(
        "shangpin",
        _config(shangpin_base_url),
        "",
        turns=["推荐一个手机，预算两千左右", "Redmi，来一个", "退货政策是什么？"],
    )
    assert result.conversation is not None
    assert len(result.conversation) == 3
    assert result.conversation[0]["input"] == "推荐一个手机，预算两千左右"
    assert "Redmi K70" in result.conversation[1]["answer"]
    assert result.conversation[1]["cards"][0]["name"].startswith("Redmi K70")
    assert result.conversation[2]["sources"] == ["doc:refund-policy"]
    assert result.trace["cartState"] == {"Redmi K70 12+256G": 1}

    final = result.final_output
    assert final["answer"] == result.conversation[-1]["answer"]
    assert final["sources"] == ["doc:refund-policy"]
    assert final["tokens"]["prompt"] > 0
    assert final["degraded"] is False
    assert final["runId"] == 1234
    assert final["agent"] == "SHOPPING_GUIDE"
    assert final["intent"] == "KNOWLEDGE_QA"
    assert final["tools"] == ["search_knowledge"]
    assert final["cartState"] == {"Redmi K70 12+256G": 1}

    span_types = [item["span_type"] for item in result.trace["custom_spans"]]
    assert span_types.count("command") == 3
    assert span_types.count("sse") == 3
    assert span_types[-1] == "final"


def test_shangpin_rate_limit_retry(shangpin_base_url: str) -> None:
    result = run_target("shangpin", _config(shangpin_base_url), "", turns=["触发限流测试"])
    assert result.conversation and result.conversation[0]["answer"]
    assert result.trace["status"] == "ok"


def test_shangpin_graph_admin_trace_spans(shangpin_base_url: str) -> None:
    config = _config(shangpin_base_url)
    config.update({
        "engine": "graph",
        "adminBaseUrl": shangpin_base_url,
        "adminUsername": "admin",
        "adminPassword": "admin-password",
    })
    result = run_target("shangpin", config, "", turns=["推荐一个手机"])
    assert result.trace["graphTrace"]["status"] == "ok"
    span_types = {item["span_type"] for item in result.trace["custom_spans"]}
    assert {"agent", "llm", "tool", "retrieval"} <= span_types
    agent_spans = [item for item in result.trace["custom_spans"] if item["span_type"] == "agent"]
    assert any(item["name"] == "Agent 执行" for item in agent_spans)
    llm_span = next(item for item in result.trace["custom_spans"] if item["span_type"] == "llm")
    assert llm_span["parent_span_id"] in {item["id"] for item in agent_spans}


def test_shangpin_graph_trace_skipped_when_admin_unavailable(shangpin_base_url: str) -> None:
    config = _config(shangpin_base_url)
    config.update({"engine": "graph", "adminBaseUrl": shangpin_base_url})
    result = run_target("shangpin", config, "", turns=["推荐一个手机"])
    assert result.trace["graphTrace"]["status"] == "skipped"
    assert any(
        item["span_type"] == "agent" and item["status"] == "skipped"
        for item in result.trace["custom_spans"]
    )
    assert result.conversation and result.conversation[0]["answer"]


def test_shangpin_http_error_is_adapter_error() -> None:
    with pytest.raises(AdapterError):
        run_target("shangpin", {"baseUrl": "http://127.0.0.1:1"}, "", turns=["你好"])


def _rule_trace() -> dict:
    last = {
        "input": "Redmi，来两台",
        "answer": "已加入购物车，Redmi K70 两台，请到购物车结算。",
        "cards": [{"spuId": "104", "name": "Redmi K70 12+256G"}],
        "sources": ["cart:1", "retrieval:vector"],
        "tokens": {"prompt": 100, "completion": 20},
        "degraded": False,
        "cartState": {"Redmi K70 12+256G": 2},
    }
    return {
        "answer": last["answer"],
        "conversation": [last],
        "final_output": last,
        "cartState": last["cartState"],
    }


def test_shangpin_rules_positive() -> None:
    checks = [
        {"type": "source_contains", "expected": "retrieval"},
        {"type": "source_not_contains", "expected": "order:"},
        {"type": "card_contains", "expected": "Redmi K70"},
        {"type": "card_not_contains", "expected": "iPhone 15"},
        {"type": "cart_quantity", "expected": {"title": "Redmi K70", "quantity": 2}},
        {"type": "cart_quantity", "expected": [{"title": "Redmi K70", "quantity": 2}, {"title": "iPhone", "quantity": 0}]},
        {"type": "forbid_pattern", "expected": "双人帐篷"},
        {"type": "max_sources", "expected": 3},
        {"type": "degraded_false"},
    ]
    result = evaluate_rules(_rule_trace(), {}, checks, [])
    assert result["verdict"] == "pass", result
    assert result["score"] == 1.0


def test_shangpin_rules_negative() -> None:
    checks = [
        {"type": "source_contains", "expected": "order:"},
        {"type": "source_not_contains", "expected": "cart:"},
        {"type": "card_contains", "expected": "iPhone 15"},
        {"type": "card_not_contains", "expected": "Redmi"},
        {"type": "cart_quantity", "expected": {"title": "Redmi K70", "quantity": 1}},
        {"type": "forbid_pattern", "expected": "购物车"},
        {"type": "max_sources", "expected": 1},
    ]
    result = evaluate_rules(_rule_trace(), {}, checks, [])
    assert result["verdict"] == "fail"
    assert all(not item["passed"] for item in result["checks"])


def test_shangpin_max_sources_zero_and_degraded() -> None:
    trace = {
        "answer": "今天北京天气我查不到哦。",
        "conversation": [{
            "answer": "今天北京天气我查不到哦。",
            "cards": [],
            "sources": [],
            "tokens": {"prompt": 10, "completion": 5},
            "degraded": True,
        }],
    }
    result = evaluate_rules(trace, {}, [
        {"type": "max_sources", "expected": 0},
        {"type": "degraded_false"},
    ], [])
    checks = {item["label"]: item["passed"] for item in result["checks"]}
    assert checks["来源数量上限"] is True
    assert checks["未降级"] is False


def test_golden_json_has_20_complete_cases() -> None:
    cases = json.loads(GOLDEN_PATH.read_text(encoding="utf-8"))
    assert len(cases) == 20
    expected_ids = [
        "E01-presale-phone-budget",
        "E02-followup-specs-pronoun",
        "E03-followup-specs-named",
        "E04-addcart",
        "E05-out-of-catalog",
        "E06-order-none",
        "E07-knowledge-refund",
        "E08-pii",
        "E09-injection",
        "E10-identity",
        "E11-colloquial-typo",
        "E12-multi-category",
        "E13-long-descriptive",
        "E14-addcart-qty2",
        "E15-followup-switch",
        "E16-order-trace-missing",
        "E17-aftersale-broken-screen",
        "E18-injection-en",
        "E19-chitchat-weather",
        "E20-price-question",
    ]
    assert [item["id"] for item in cases] == expected_ids
    required = {
        "id", "businessRule", "turns", "sources", "maxSources", "cards",
        "cart", "answerKeywords", "forbid", "judge",
    }
    for case in cases:
        assert required <= set(case), case["id"]
        assert case["turns"], case["id"]
        assert isinstance(case["sources"], list)
        assert isinstance(case["cards"], list)
        assert isinstance(case["cart"], list)
        assert isinstance(case["answerKeywords"], list)
        assert isinstance(case["forbid"], list)
        judge = case["judge"]
        assert judge["enabled"] is True
        assert 0 < judge["threshold"] <= 1
        assert judge["steps"], case["id"]


def test_golden_import_checks_generation() -> None:
    from scripts.import_shangpin_golden import SMOKE_IDS, build_checks, build_expected, load_goldens

    cases = {case["id"]: case for case in load_goldens(GOLDEN_PATH)}
    e01 = cases["E01-presale-phone-budget"]
    checks = build_checks(e01)
    types = [item["type"] for item in checks]
    assert types == ["source_contains", "max_sources", "card_contains", "contains", "degraded_false"]
    assert {"type": "source_contains", "expected": "retrieval"} in checks
    assert {"type": "max_sources", "expected": 3} in checks
    assert {"type": "contains", "expected": "2299"} in checks

    e04 = cases["E04-addcart"]
    assert {"type": "cart_quantity", "expected": {"title": "Redmi K70", "quantity": 1}} in build_checks(e04)

    assert cases["E10-identity"]["maxSources"] == 0
    assert {"type": "max_sources", "expected": 0} in build_checks(cases["E10-identity"])
    assert build_expected(e01)["judge"]["steps"]
    assert SMOKE_IDS == [
        "E01-presale-phone-budget",
        "E04-addcart",
        "E07-knowledge-refund",
        "E09-injection",
        "E06-order-none",
    ]


def test_shangpin_api_run_persists_conversation(app_client, admin_headers, shangpin_base_url: str) -> None:
    base = "/api/v1/agent-test"
    target_response = app_client.post(
        f"{base}/targets",
        headers=admin_headers,
        json={
            "name": f"Shang Pivot 测试 {time.time_ns()}",
            "adapterType": "shangpin",
            "description": "pytest shangpin target",
            "config": _config(shangpin_base_url),
        },
    )
    assert target_response.status_code == 200, target_response.text
    target = target_response.json()["data"]
    assert target["adapterType"] == "shangpin"

    case_response = app_client.post(
        f"{base}/cases",
        headers=admin_headers,
        json={
            "name": "尚品汇多轮用例",
            "targetId": target["id"],
            "inputType": "text",
            "command": "推荐一个手机",
            "turns": ["推荐一个手机，预算两千左右", "Redmi，来一个", "退货政策是什么？"],
            "expected": {"judge": {"enabled": True, "threshold": 0.7, "steps": ["是否真实"]}},
            "checks": [],
            "priority": "P0",
        },
    )
    assert case_response.status_code == 200, case_response.text
    case = case_response.json()["data"]
    assert case["turns"] == ["推荐一个手机，预算两千左右", "Redmi，来一个", "退货政策是什么？"]

    run_response = app_client.post(f"{base}/runs", headers=admin_headers, json={"caseId": case["id"]})
    assert run_response.status_code == 200, run_response.text
    detail = run_response.json()["data"]
    run = detail["run"]
    assert run["status"] == "pass", run
    assert len(run["conversation"]) == 3
    final = run["finalOutput"]
    for key in ["answer", "cards", "sources", "tokens", "degraded", "runId", "agent", "intent", "tools", "cartState"]:
        assert key in final, key
    assert final["cartState"] == {"Redmi K70 12+256G": 1}
    assert run["input"]["turns"][0] == "推荐一个手机，预算两千左右"

    detail_response = app_client.get(f"{base}/runs/{run['id']}", headers=admin_headers)
    assert detail_response.status_code == 200
    assert len(detail_response.json()["data"]["run"]["conversation"]) == 3
