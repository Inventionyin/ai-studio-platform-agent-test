from __future__ import annotations

import os
import tempfile
from pathlib import Path

os.environ["DATABASE_URL"] = "postgresql+psycopg://ai:ai_local_password@127.0.0.1:55432/ai_test_platform_test"
os.environ["APP_ENV"] = "test"
os.environ["APP_SECRET"] = "test-secret-for-pytest-only-0123456789"
os.environ["SEED_ADMIN_PASSWORD"] = "Admin@12345"
os.environ["FRONTEND_URL"] = "http://localhost:8443"
os.environ["LLM_API_KEY"] = "test-key"
os.environ["LLM_BASE_URL"] = "http://127.0.0.1:8010/v1"
os.environ["UPLOAD_DIR"] = tempfile.mkdtemp(prefix="ast-test-uploads-")

import pytest
from fastapi.testclient import TestClient


@pytest.fixture(scope="session", autouse=True)
def prepare_database():
    import app.models  # noqa: F401 - registers tables on Base.metadata
    from app.db import Base, engine
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    yield


@pytest.fixture(scope="session")
def app_client():
    from app.main import app
    with TestClient(app) as client:
        yield client


@pytest.fixture(scope="session")
def admin_headers(app_client):
    response = app_client.post("/api/v1/auth/login", json={"email": "zhangwei@corp.com", "password": "Admin@12345"})
    assert response.status_code == 200, response.text
    token = response.json()["data"]["accessToken"]
    return {"Authorization": f"Bearer {token}", "X-Project-Id": "ecommerce"}


def login_headers(client: TestClient, email: str, password: str, project: str = "ecommerce") -> dict[str, str]:
    response = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['data']['accessToken']}", "X-Project-Id": project}


@pytest.fixture
def fake_llm(monkeypatch):
    def fake_chat(system: str, _user: str):
        if "需求分析师" in system:
            return {"children": [
                {"title": "会员等级展示", "description": "展示等级", "priority": "P0", "points": ["等级"]},
                {"title": "积分明细", "description": "查看积分", "priority": "P1", "points": ["分页"]},
            ]}
        if "测试工程师" in system:
            return {"cases": [
                {"title": "会员等级正确展示", "module": "会员", "type": "正向", "priority": "P0", "precondition": "已登录", "steps": ["进入会员中心"], "expected": "展示等级"},
                {"title": "积分为 0 空状态", "module": "会员", "type": "边界", "priority": "P1", "precondition": "积分为 0", "steps": ["进入会员中心"], "expected": "空状态"},
            ]}
        return {}

    monkeypatch.setattr("app.llm.chat_json", fake_chat)

    def fake_text(system: str, user: str, _model=None):
        return f"测试模型回答：{user[:60]}", {"prompt": 100, "completion": 40}

    monkeypatch.setattr("app.routers.ai.chat_text", fake_text)
    return fake_chat


FIXTURE_MCP = str(Path(__file__).parent / "fixtures" / "echo_mcp.py")
