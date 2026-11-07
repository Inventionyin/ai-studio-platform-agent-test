from __future__ import annotations

import sys

from tests.conftest import FIXTURE_MCP, login_headers


def test_auth_required_and_login(app_client) -> None:
    assert app_client.get("/api/v1/projects").status_code == 401
    response = app_client.post("/api/v1/auth/login", json={"email": "zhangwei@corp.com", "password": "Admin@12345"})
    assert response.status_code == 200
    token = response.json()["data"]["accessToken"]
    me = app_client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.json()["data"]["name"] == "张伟"


def test_project_crud(app_client, admin_headers) -> None:
    created = app_client.post("/api/v1/projects", headers=admin_headers, json={"name": "回归项目", "description": "pytest"})
    assert created.status_code == 200
    project = created.json()["data"]
    updated = app_client.put(f"/api/v1/projects/{project['id']}", headers=admin_headers, json={"name": "回归项目 Renamed"})
    assert updated.json()["data"]["name"] == "回归项目 Renamed"
    archived = app_client.delete(f"/api/v1/projects/{project['id']}", headers=admin_headers)
    assert archived.status_code == 200
    names = [item["name"] for item in app_client.get("/api/v1/projects", headers=admin_headers).json()["data"]]
    assert "回归项目 Renamed" not in names


def test_requirement_upload_split_and_generate(app_client, admin_headers, fake_llm) -> None:
    content = "# 会员需求\n## 会员等级\n会员等级展示。\n## 积分明细\n积分明细查询。".encode()
    uploaded = app_client.post(
        "/api/v1/requirements/upload",
        headers=admin_headers,
        data={"title": "pytest 主需求"},
        files={"files": ("req.md", content, "text/markdown")},
    )
    assert uploaded.status_code == 200, uploaded.text
    requirement = uploaded.json()["data"]
    assert requirement["files"][0]["filename"] == "req.md"
    preview = app_client.get(
        f"/api/v1/requirements/{requirement['id']}/files/{requirement['files'][0]['id']}/text",
        headers=admin_headers,
    )
    assert preview.status_code == 200
    assert "会员需求" in preview.json()["data"]["text"]

    split = app_client.post(f"/api/v1/requirements/{requirement['id']}/split", headers=admin_headers)
    assert split.status_code == 200, split.text
    children = split.json()["data"]["splitProposal"]["children"]
    assert len(children) == 2

    confirmed = app_client.post(
        f"/api/v1/requirements/{requirement['id']}/split/confirm",
        headers=admin_headers,
        json={"children": children},
    )
    assert confirmed.status_code == 200
    assert len(confirmed.json()["data"]) == 2

    generated = app_client.post(
        f"/api/v1/requirements/{requirement['id']}/generate",
        headers=admin_headers,
        json={"kind": "prototype"},
    )
    assert generated.status_code == 200
    assert len(generated.json()["data"]["prototype"]["pages"]) >= 2

    updated = app_client.put(
        f"/api/v1/requirements/{requirement['id']}",
        headers=admin_headers,
        json={"title": "pytest 主需求（已编辑）", "priority": "P2", "owner": "李娜", "status": "待评审"},
    )
    assert updated.status_code == 200
    assert updated.json()["data"]["title"] == "pytest 主需求（已编辑）"
    assert updated.json()["data"]["priority"] == "P2"
    assert updated.json()["data"]["owner"] == "李娜"


def test_split_falls_back_to_local_when_llm_is_unrelated(app_client, admin_headers, fake_llm) -> None:
    content = """# AI 测试开发平台技术方案
## 一、技术选型总览
前端使用 React，后端使用 FastAPI。
## 二、前端技术方案
路由使用 React Router，编辑器使用 Monaco。
## 三、后端技术方案
PostgreSQL 存储业务数据，Alembic 管理迁移。
## 四、风险清单
模型调用超时和文件解析失败需要兜底。
""".encode()
    uploaded = app_client.post(
        "/api/v1/requirements/upload",
        headers=admin_headers,
        data={"title": "技术方案拆分测试"},
        files={"files": ("tech.md", content, "text/markdown")},
    )
    requirement = uploaded.json()["data"]
    split = app_client.post(f"/api/v1/requirements/{requirement['id']}/split", headers=admin_headers)
    assert split.status_code == 200, split.text
    proposal = split.json()["data"]["splitProposal"]
    assert proposal["mode"] == "local"
    titles = [child["title"] for child in proposal["children"]]
    assert any("技术选型" in title for title in titles)
    assert any("后端技术方案" in title for title in titles)


def test_testcases_generate_review_and_excel(app_client, admin_headers, fake_llm) -> None:
    generated = app_client.post(
        "/api/v1/testcases/generate",
        headers=admin_headers,
        json={"source": "需求文档", "requirementId": "REQ-021"},
    )
    assert generated.status_code == 200
    cases = generated.json()["data"]
    assert len(cases) == 2
    submitted = app_client.post("/api/v1/testcases/review", headers=admin_headers, json={"cases": cases})
    assert submitted.status_code == 200

    exported = app_client.get("/api/v1/testcases/export.xlsx", headers=admin_headers)
    assert exported.status_code == 200
    assert exported.content[:2] == b"PK"

    imported = app_client.post(
        "/api/v1/testcases/import.xlsx",
        headers=admin_headers,
        files={"file": ("testcases.xlsx", exported.content, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
    )
    assert imported.status_code == 200, imported.text
    assert imported.json()["data"]["errors"] == []


def test_skill_import_and_update(app_client, admin_headers) -> None:
    imported = app_client.post(
        "/api/v1/skills/import",
        headers=admin_headers,
        files={"file": ("skill.md", "---\nname: pytest 技能\ndescription: 导入测试\n---\n\n你是测试助手", "text/markdown")},
    )
    assert imported.status_code == 200, imported.text
    skill = imported.json()["data"]
    updated = app_client.put(f"/api/v1/skills/{skill['id']}", headers=admin_headers, json={"prompt": "updated prompt"})
    assert updated.json()["data"]["prompt"] == "updated prompt"


def test_mcp_registry_and_connection(app_client, admin_headers) -> None:
    created = app_client.post(
        "/api/v1/mcp/servers",
        headers=admin_headers,
        json={"name": "echo", "command": sys.executable, "args": [FIXTURE_MCP], "env": {}, "description": "test"},
    )
    assert created.status_code == 200, created.text
    server = created.json()["data"]
    tested = app_client.post(f"/api/v1/mcp/servers/{server['id']}/test", headers=admin_headers)
    assert tested.status_code == 200, tested.text
    result = tested.json()["data"]
    assert result["status"] == "正常"
    assert {tool["name"] for tool in result["tools"]} == {"echo", "add"}


def test_role_permissions(app_client, admin_headers) -> None:
    invite_response = app_client.post(
        "/api/v1/auth/invites",
        headers={"Authorization": admin_headers["Authorization"]},
        json={"email": "pytest-reviewer@corp.com", "role": "评审者"},
    )
    assert invite_response.status_code == 200, invite_response.text
    invite = invite_response.json()["data"]
    accepted = app_client.post(
        "/api/v1/auth/invites/accept",
        json={"token": invite["token"], "name": "pytest reviewer", "password": "Passw0rd!"},
    )
    assert accepted.status_code == 200
    token = accepted.json()["data"]["accessToken"]
    user_id = accepted.json()["data"]["user"]["id"]
    app_client.post(
        "/api/v1/projects/ecommerce/members",
        headers=admin_headers,
        json={"userId": user_id, "role": "评审者"},
    )
    headers = {"Authorization": f"Bearer {token}", "X-Project-Id": "ecommerce"}
    assert app_client.get("/api/v1/requirements", headers=headers).status_code == 200
    assert app_client.delete("/api/v1/requirements/REQ-018", headers=headers).status_code == 403
    assert app_client.put("/api/v1/testcases/TC-1024", headers=headers, json={"title": "会员等级正确展示"}).status_code == 200
    assert app_client.post("/api/v1/testcases/reviews/TC-1024", headers=headers, json={"action": "通过", "comment": ""}).status_code == 200


def test_knowledge_upload_and_recall(app_client, admin_headers) -> None:
    kb = app_client.post("/api/v1/knowledge", headers=admin_headers, json={"name": "pytest 知识库", "description": "", "embedding": "bge-m3"}).json()["data"]
    uploaded = app_client.post(
        "/api/v1/knowledge/docs",
        headers=admin_headers,
        data={"kbId": kb["id"]},
        files={"file": ("rules.md", "# 物业规则\n物业费账单发布后，人工登记已缴必须填写原因并写审计。车位费支持批量预检。".encode(), "text/markdown")},
    )
    assert uploaded.status_code == 200, uploaded.text
    document = uploaded.json()["data"]
    assert document["chunks"] >= 1
    recall = app_client.post("/api/v1/knowledge/recall", headers=admin_headers, json={"query": "物业费 账单 审计", "topK": 5})
    assert recall.status_code == 200
    assert any("物业费" in hit["content"] for hit in recall.json()["data"])


def test_chat_uses_knowledge_and_llm(app_client, admin_headers, fake_llm) -> None:
    conversation = app_client.get("/api/v1/ai/conversations", headers=admin_headers).json()["data"][0]
    response = app_client.post(
        f"/api/v1/ai/conversations/{conversation['id']}/messages",
        headers=admin_headers,
        json={"text": "物业费账单怎么登记已缴？"},
    )
    assert response.status_code == 200, response.text
    message = response.json()["data"]["message"]
    assert message["content"]
    assert isinstance(message["citations"], list)
    assert message["usage"]["completion"] > 0


def test_audit_log_records_mutation(app_client, admin_headers) -> None:
    audits = app_client.get("/api/v1/admin/audits", headers=admin_headers).json()["data"]
    assert any(item["action"] == "POST /api/v1/projects" for item in audits)


def test_api_send_executes_real_request(app_client, admin_headers) -> None:
    from http.server import BaseHTTPRequestHandler, HTTPServer
    import json
    import threading

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            body = json.dumps({"code": 0, "data": {"ok": True}}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *_args):
            return

    server = HTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        response = app_client.post(
            "/api/v1/api-defs/send",
            headers=admin_headers,
            json={
                "method": "GET",
                "url": f"http://127.0.0.1:{server.server_address[1]}/health",
                "assertions": [
                    {"type": "状态码", "expression": "-", "expected": "200"},
                    {"type": "JSONPath", "expression": "$.code", "expected": "0"},
                    {"type": "响应时间", "expression": "-", "expected": "< 500ms"},
                ],
            },
        )
        assert response.status_code == 200, response.text
        data = response.json()["data"]
        assert data["status"] == 200
        assert data["assertionsPassed"] == 3
    finally:
        server.shutdown()


def test_data_factory_removed(app_client, admin_headers) -> None:
    assert app_client.get("/api/v1/data/tools", headers=admin_headers).status_code == 404


def test_agent_eval_proxy_and_auth(app_client, admin_headers, monkeypatch) -> None:
    import app.routers.agent_eval as module

    assert app_client.get("/api/v1/agent-eval/reports").status_code == 401

    async def fake_agent(method: str, path: str, **kwargs):
        if path == "/eval/reports":
            return [{"name": "real", "label": "DeepSeek 真实模型", "exists": True, "case_count": 8, "llm": "deepseek-flash"}]
        if path == "/agent/chat":
            return {
                "run_id": "run_test",
                "trace_id": "trace_test",
                "session_id": "sess_test",
                "intent": "shopping",
                "agent": "ShoppingGuideAgent",
                "status": "ok",
                "answer": "测试回答",
                "tools": [],
                "latency_ms": 12.3,
            }
        if path == "/agent/runs/run_test":
            return {
                "run_id": "run_test",
                "trace_id": "trace_test",
                "session_id": "sess_test",
                "message": "帮我找帐篷",
                "intent": "shopping",
                "agent": "ShoppingGuideAgent",
                "status": "ok",
                "answer": "测试回答",
                "llm_calls": [{"node": "route", "model": "test", "prompt": "p", "response": "r", "latency_ms": 1, "at": "2026-11-05T00:00:00+00:00"}],
                "tool_calls": [],
                "retrievals": [],
                "latency_ms": 12.3,
            }
        raise AssertionError(f"unexpected path: {method} {path}")

    monkeypatch.setattr(module, "_agent_request", fake_agent)

    reports = app_client.get("/api/v1/agent-eval/reports", headers=admin_headers)
    assert reports.status_code == 200
    assert reports.json()["data"][0]["case_count"] == 8

    chat = app_client.post("/api/v1/agent-eval/chat", headers=admin_headers, json={"message": "帮我找帐篷"})
    assert chat.status_code == 200
    assert chat.json()["data"]["response"]["agent"] == "ShoppingGuideAgent"
    assert chat.json()["data"]["trace"]["llm_calls"][0]["node"] == "route"
