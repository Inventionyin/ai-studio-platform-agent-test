from __future__ import annotations

import json
from functools import lru_cache
from typing import Any

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = "postgresql+psycopg://ai:ai_local_password@127.0.0.1:55432/ai_test_platform"
    app_env: str = "development"
    app_secret: str = "change-me-in-production"
    frontend_url: str = "http://localhost:8443"
    cookie_secure: bool = False
    cookie_name: str = "ast_refresh"
    cookie_path: str = "/api/v1/auth"
    access_token_minutes: int = 30
    refresh_token_days: int = 7
    seed_admin_password: str = ""
    upload_dir: str = "uploads"
    max_upload_mb: int = 50
    llm_base_url: str = "https://api.openai.com/v1"
    llm_api_key: str = ""
    llm_model: str = "gpt-4o-mini"
    llm_timeout_seconds: int = 120
    judge_base_url: str = "https://api.openai.com/v1"
    judge_api_key: str = ""
    judge_model: str = "deepseek-v4.1-flash"
    judge_timeout_seconds: int = 60
    judge_max_tokens: int = 3000
    fix_doc_dir: str = "docs/fix-experience"
    oauth_providers_json: str = "{}"
    oauth_default_role: str = "只读"
    mcp_timeout_seconds: int = 20
    api_test_timeout_seconds: int = 15
    agent_service_url: str = "http://127.0.0.1:8088"
    agent_service_timeout_seconds: int = 60
    allow_private_targets: bool = True

    @property
    def oauth_providers(self) -> dict[str, dict[str, Any]]:
        try:
            value = json.loads(self.oauth_providers_json or "{}")
            return value if isinstance(value, dict) else {}
        except json.JSONDecodeError:
            return {}


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
