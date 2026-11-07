# AI 测试开发平台后端

FastAPI + PostgreSQL + SQLAlchemy 2 + Alembic。提供认证、项目、需求、用例、API 测试、WebUI/App 自动化、知识库、工作流、任务、模型配置、审计与 MCP 服务管理接口。

## 运行

### Docker Compose（含前端）

```bash
cd backend
cp .env.example .env
# 修改 APP_SECRET、SEED_ADMIN_PASSWORD、LLM_API_KEY 等
docker compose up --build
```

- 前端：http://localhost:8080
- 后端：http://localhost:8000
- 文档：http://localhost:8000/docs

### 本地

```bash
cd backend
uv venv .venv --python 3.12
source .venv/bin/activate
uv pip install -r requirements.txt
cp .env.example .env
alembic upgrade head
./start.sh
```

首次启动会自动导入 `app/seed.json`。管理员密码取自 `SEED_ADMIN_PASSWORD`。

## 认证与权限

- JWT Access Token + HttpOnly Refresh Cookie；登录、刷新、退出、邀请激活。
- 管理员邀请制开号；四种平台角色：管理员/开发者/评审者/只读。
- 项目成员角色独立维护；项目数据通过 `X-Project-Id` 隔离。
- OAuth/OIDC 通过 `OAUTH_PROVIDERS_JSON` 配置。

## 关键能力

- 多文件上传与 PDF/DOCX/Markdown/TXT 解析。
- LLM 需求拆分（OpenAI 兼容接口），拆分草案确认后创建子需求。
- 多页原型结构、表单/JSON 编辑、PNG 导出。
- 用例评审内编辑、通过并保存、`.xlsx` 导入导出。
- `SKILL.md` 导入与技能编辑。
- MCP 服务登记、环境变量加密、stdio 连接测试与工具列表。
- 真实知识库入库：文件解析、切片、关键词召回；AI 对话带知识库上下文与引用。
- API 调试真实 HTTP 请求与状态码/JSONPath/响应时间断言。
- 变更请求自动写入审计日志。

## 测试

```bash
.venv/bin/python -m pytest -q
```

测试使用独立的 `ai_test_platform_test` 数据库，会话开始时重建表。

## 迁移

```bash
alembic upgrade head
alembic revision --autogenerate -m "change"
```

## 安全边界

- 生产环境必须设置强 `APP_SECRET`、`SEED_ADMIN_PASSWORD`，首次登录后修改管理员密码。
- HTTPS 下设置 `COOKIE_SECURE=true`。
- MCP 连接测试会执行本地命令，仅管理员可用；生产应放入受限容器/沙箱。
- 知识库召回是关键词匹配，尚未接入 Embedding / Rerank。
- 当前没有 Celery/Redis 执行队列、真实 Playwright/Airtest 执行器和邮件服务。
- 文件存储在本地磁盘；多实例部署需替换为对象存储。
