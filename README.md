# AI 测试开发平台

覆盖「需求导入与拆分 → 原型/接口设计 → AI 用例生成与评审 → API / WebUI / App 自动化 → 知识库 / 工作流 → 任务与报告」的完整前后端系统。

- 前端：React 19 + TypeScript + Vite + Tailwind CSS v4 + React Router + Monaco
- 后端：FastAPI + SQLAlchemy 2 + PostgreSQL 16 + Alembic
- 认证：JWT + HttpOnly Refresh Cookie，管理员邀请制，四种角色，OAuth/OIDC
- AI：OpenAI 兼容接口（需求拆分、用例生成），未配置时返回明确错误，不静默造假
- 文件：本地磁盘保存原文件；PDF / DOCX / Markdown / TXT 真实解析
- Excel：测试用例 `.xlsx` 双向导入导出
- MCP：管理员登记服务、启动子进程、连接测试、读取工具列表
- 知识库：真实文件解析、切片入库、关键词召回；AI 对话自动带知识库上下文与引用
- API 调试：真实发送 HTTP 请求，执行状态码 / JSONPath / 响应时间断言
- Agent 评测：接入尚品汇 Agent 服务，查看评测报告、运行 trace，并执行真实链路验证
- 审计：所有变更请求自动记录操作人、动作、项目与状态

## 快速启动（Docker）

```bash
cd backend
cp .env.example .env
# 修改 .env：APP_SECRET、SEED_ADMIN_PASSWORD、LLM_API_KEY 等
docker compose up --build
```

- 前端：http://localhost:8080
- 后端文档：http://localhost:8000/docs
- PostgreSQL：127.0.0.1:55432

首次启动会自动执行 Alembic 迁移并导入演示数据。管理员账号：

- 邮箱：`zhangwei@corp.com`
- 密码：`SEED_ADMIN_PASSWORD` 的值（首次启动后请立即修改）

## 本地开发

```bash
# 1. PostgreSQL
cd backend
docker compose up -d postgres

# 2. 后端
uv venv .venv --python 3.12
source .venv/bin/activate
uv pip install -r requirements.txt
cp .env.example .env   # 本地可参考 .env 现有配置
alembic upgrade head
uvicorn app.main:app --reload --port 8000

# 3. 前端（新终端）
pnpm install
pnpm dev               # http://localhost:8443，/api 代理到 8000
```

## 本地一键部署

```bash
cd backend && cp .env.example .env   # 首次填写配置
cd ..
bash scripts/deploy_local.sh
```

启动 PostgreSQL、MinIO、RabbitMQ、平台后端、Mock Agent、前端；可选通过 `SHANGPIVOT_HOME` 启动尚品汇 graph。详见 `docs/本地部署.md`。

## 导入本地项目

```bash
backend/.venv/bin/python scripts/import_property_project.py --source /Users/imac/Desktop/物业小程序
```

脚本会创建「物业小程序」项目，从 PRD 自动生成 8 个主需求 + 65 个子需求，导入 36 条验收用例，并把 PRD、接口、数据模型、验收标准等 12 篇文档索引进知识库（当前 184 个切片）。

## 账号与权限

- 平台不开放自助注册；管理员在「团队管理 → 成员列表」或「管理后台 → 用户管理」生成邀请链接，成员打开 `/accept-invite?token=...` 设置密码。
- 平台角色：管理员 / 开发者 / 评审者 / 只读。
- 项目角色独立维护：管理员 / 开发者 / 评审者 / 只读。邀请用户后，需要在「团队管理 → 项目分配」把用户加入项目。
- 项目数据通过 `X-Project-Id` 请求头隔离；非项目成员无法读取项目数据。
- 权限边界：只读可查看；评审者可评审/编辑用例；开发者可创建与修改；管理员拥有全部权限和管理后台。
- OAuth/OIDC 通过 `OAUTH_PROVIDERS_JSON` 配置，例如：

```json
{
  "google": {
    "name": "Google",
    "authorize_url": "https://accounts.google.com/o/oauth2/v2/auth",
    "token_url": "https://oauth2.googleapis.com/token",
    "userinfo_url": "https://openidconnect.googleapis.com/v1/userinfo",
    "client_id": "...",
    "client_secret": "...",
    "scope": "openid email profile",
    "allowed_domains": ["corp.com"]
  }
}
```

## 需求与 AI

- 上传支持多个 PDF / DOCX / Markdown / TXT；原文件保存在 `UPLOAD_DIR`，解析文本写入数据库。
- 上传后可以自动调用 LLM 拆分主/子需求；拆分结果先进入「待确认」，人工修改后确认才创建子需求。
- 拆分结果会与文档章节做相关性校验；模型输出与文档不相关时自动回落到本地章节拆分，并显示「本地结构拆分」标记，弹窗内可重新拆分。
- 需求名称、优先级、负责人、状态和描述可在详情页编辑。
- 需求详情支持多页原型 Tab/翻页、表单/JSON 编辑、PNG 导出、版本对比。
- 需求详情可直接跳转「测试用例 → AI 生成用例」，并把需求作为输入上下文。
- 用例评审支持编辑标题、前置条件、步骤、预期、优先级，点击「通过并保存」同时写回用例并记录评审。
- 用例列表与评审页都支持 `.xlsx` 导出/导入；导入按 ID 更新，无 ID 新建，不删除系统内多余用例。
- 需求文档支持在线文本预览与下载。
- 知识库支持 PDF/DOCX/Markdown/TXT 解析、切片和召回；AI 对话会把召回片段注入模型并返回引用来源。
- API 调试面板会真实向目标地址发请求并执行断言；`ALLOW_PRIVATE_TARGETS=false` 可禁止内网目标。

## Agent 评测

- 入口：`项目空间 → 任务与报告 → Agent 评测`。
- 评测报告：规则模型 / DeepSeek 真实模型两份报告，展示通过率、意图/Agent/工具/事实准确率、平均延迟。
- 用例详情：最终回答、期望 vs 实际、工具调用、LLM prompt/response、检索 hits/score。
- 真实调用验证：从 AI_Studio 后端真实请求 Agent 服务，验证商品搜索、知识库 RAG、订单鉴权 3 条链路，并检查每次运行的 trace。
- 自定义调用：输入消息与可选登录态，实时返回 Agent 回答和 trace；登录态只用于本次请求，不保存。
- 运行记录：读取 Agent 服务的 trace 存储（本地 JSONL 或 PostgreSQL），查看 LLM / 工具 / 检索时间线。

配置 `AGENT_SERVICE_URL` 指向 Agent 服务，默认 `http://127.0.0.1:8088`。

## Agent 全链路追踪（新增）

- 入口：`项目空间 → 任务与报告 → Agent 测试`
- 支持 `mock / http / cli / shangpin` 四类适配器；Shang Pivot 适配器支持手机号+验证码登录、多轮 SSE、购物车终态、限流重试，以及 V3.1 graph 管理端 trace 导入。
- 判定：规则断言 + wb2api LLM Judge + 人工评审，最终状态自动聚合。
- 修复：失败 → 修复工单 → 回归 → 自动生成 `docs/fix-experience/v1.0---<名称>-fix经验积累.md`。
- 已内置尚品汇 20 条 Golden 用例导入脚本与 5 条冒烟脚本。
- 详细方案：`docs/shangpin-adapter-contract.md`、`docs/shangpin-phase1-runbook.md`、`docs/shangpin-golden-test-report.md`。

## MCP

- 入口：`技能市场 → MCP 服务`（仅管理员可见）。
- 登记字段：名称、启动命令、参数、环境变量、描述。
- 「连接测试」会以 stdio 启动子进程并读取工具列表，超时 20 秒。
- 环境变量使用 `APP_SECRET` 派生的 Fernet 密钥加密存储。
- 安全边界：这是执行本地命令的能力，只对管理员开放；生产环境应放入受限容器/沙箱，并限制可执行命令与网络。

## 配置

| 变量 | 说明 |
|---|---|
| `DATABASE_URL` | PostgreSQL 连接串 |
| `APP_SECRET` | JWT / Cookie / 环境变量加密密钥，至少 32 字节 |
| `FRONTEND_URL` | 前端地址，用于邀请链接与 OAuth 回调 |
| `COOKIE_SECURE` | HTTPS 部署时设为 `true` |
| `SEED_ADMIN_PASSWORD` | 首次启动管理员密码；生产必须设置 |
| `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL` | OpenAI 兼容模型服务 |
| `OAUTH_PROVIDERS_JSON` | OIDC/OAuth 供应商配置 |
| `UPLOAD_DIR` / `MAX_UPLOAD_MB` | 文件存储与大小限制 |
| `MCP_TIMEOUT_SECONDS` | MCP 连接测试超时 |
| `AGENT_SERVICE_URL` | 尚品汇 Agent 服务地址，默认 `http://127.0.0.1:8088` |
| `AGENT_SERVICE_TIMEOUT_SECONDS` | Agent 调用超时，默认 60 秒 |

## 测试

```bash
pnpm exec tsc --noEmit
pnpm test
pnpm build

cd backend
.venv/bin/python -m pytest -q
```

后端测试使用独立的 `ai_test_platform_test` 数据库，测试前会重建表，不污染开发库。

## 迁移与备份

```bash
cd backend
alembic upgrade head
pg_dump -h 127.0.0.1 -p 55432 -U ai ai_test_platform > backup.sql
```

## 当前边界

- 任务进度仍由前端模拟；后端保存任务历史与版本，未接入 Celery/Redis 执行队列。
- AI 生成、需求拆分与对话依赖外部模型；没有配置 Key 时接口返回 503。
- 知识库召回是关键词/中文二元组匹配，不是向量检索；Embedding/Rerank 尚未接入。
- API 调试、WebUI/App 执行仍是模拟结果，未接入真实 Playwright/Airtest 执行器。
- 邀请链接由管理员手动发送，未接入 SMTP/IM 邮件服务。
- 文件存储为本地磁盘，多实例部署需替换为 MinIO/S3。
- 数据工厂模块已按修改意见彻底删除。
- Agent 评测页依赖独立的尚品汇 Agent 服务；服务未启动时页面会显示明确错误，不影响其他模块。
