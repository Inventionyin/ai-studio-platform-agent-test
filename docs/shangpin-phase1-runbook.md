# 尚品汇 AI 助手 Phase 1 运行手册

## 1. 当前已接通的链路

```text
我们的平台
  → Shang Pivot adapter
  → https://shang.bettery.cn
  → 手机号+验证码登录
  → 创建会话
  → 多轮 SSE（reasoning / delta / cards / done）
  → 规则判定 + wb2api LLM Judge + 人工
  → 失败修复工单 + v1.0---<名称>-fix经验积累.md
```

远程 V3.0 的 `done` 事件只返回 `messageId/sessionStatus/degraded/sources/tokens`，没有 `runId`，因此 Phase 1 没有内部 Agent trace。Phase 2 本地 V3.1 graph 才补 `agent_run/step/llm/tool/retrieval`。

## 2. 启动

```bash
# 平台依赖
cd D:/developertest/ai-studio-platform-main/backend
.venv/Scripts/python -m alembic upgrade head
.venv/Scripts/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000

# 前端
cd D:/developertest/ai-studio-platform-main
pnpm dev --host 127.0.0.1
```

登录平台：`zhangwei@corp.com`，密码见 `backend/.env`。

页面：`http://127.0.0.1:8443/project/ecommerce/tasks/agent-test`

## 3. 导入 Golden

```bash
cd backend
# 5 条冒烟
.venv/Scripts/python scripts/import_shangpin_golden.py \
  --smoke --email zhangwei@corp.com --password '<本地密码>' --project ecommerce

# 全量 20 条
.venv/Scripts/python scripts/import_shangpin_golden.py \
  --email zhangwei@corp.com --password '<本地密码>' --project ecommerce
```

导入会创建/更新：

- target：`Shang Pivot 智能客服`（adapterType=`shangpin`）
- 20 条 `E01...E20` Golden 用例，`turns` 保存多轮输入，`checks` 自动生成

## 4. 远程冒烟

```bash
cd backend
# 5 条冒烟（默认 dry-run，只打印计划）
.venv/Scripts/python scripts/run_shangpin_smoke.py

# 真实调用（低频；E04 会真实加购，adapter 会先清空购物车）
.venv/Scripts/python scripts/run_shangpin_smoke.py --live
```

远程限流为约 20 条/5 分钟/账号；adapter 默认 1.2s 节流，并在“发送太频繁”时等待 120s 重试，仍建议低频执行。

## 5. 平台内运行

1. 任务与报告 → Agent 测试 → 测试用例
2. 选择 `Shang Pivot 智能客服` target
3. 运行控制台选择 Golden 用例 → 运行
4. Trace 详情查看：
   - 每轮 command / SSE
   - 最终回答、cards、sources、tokens、degraded
   - 规则 checks 与 LLM Judge
5. 失败 → 修复工作台 → 新建工单 → 生成经验文档

## 6. 当前 20 条结果（Phase 1）

- 确定性规则：20/20 通过
- LLM Judge：16/20 通过，3 失败，1 待复核
- 失败/待复核：
  - E02 多轮指代不明未反问
  - E05 目录外品类附带无关卡片
  - E06 无订单场景编造购物车数量
  - E13 长描述手机需求推荐 MacBook 且全部超预算

详见 `docs/shangpin-golden-test-report.md`。

## 7. Phase 2 本地 graph 前置

- PostgreSQL + pgvector（当前本机 PG 没有 vector 扩展）
- Redis（已有）
- RabbitMQ（commerce 订单事件）
- MinIO（文件/图片）
- `AGENT_ENGINE=graph`
- `AGENT_LLM_CLIENT=legacy` 或 `spring-ai`
- 管理员账号（用于拉 `/admin/customer-service/agent-runs/{runId}`）

本地 graph 跑通后，adapter 会自动把内部 trace 追加为 `agent/llm/tool/retrieval` span；如果管理端不可用，只记录 `graphTrace=skipped`，不影响黑盒结果。

## 8. Phase 3 UI 截图/录屏

```bash
cd backend
.venv/Scripts/python -m pip install -r requirements-webui.txt
# 本机已有 Chrome 时可直接用 channel=chrome，无需下载 Chromium
.venv/Scripts/python scripts/shangpin_ui_smoke.py --live --base-url http://127.0.0.1:5174 \
  --message "推荐一个手机，预算两千左右"
```

产物在 `docs/evidence/shangpin-ui/<timestamp>/`：截图、WebM 录屏、manifest.json。

## 9. MinIO / RabbitMQ 本地安装结果

### MinIO

- 二进制：`.local/minio/minio.exe`（RELEASE.2024-10-13T13-34-11Z）
- 数据目录：`.local/minio/data`
- 启动：

```bash
cd .local/minio
MINIO_ROOT_USER=minioadmin MINIO_ROOT_PASSWORD=minioadmin \
  ./minio.exe server ./data --address 127.0.0.1:9000 --console-address 127.0.0.1:9001
```

- 控制台：`http://127.0.0.1:9001`
- Bucket：`shang-pivot`
- 已上传 30 张商品图到 `PRODUCT/seed/`

### RabbitMQ

- Erlang OTP 27.3.4 + RabbitMQ 4.4.0 已安装
- Windows 服务名：`RabbitMQ`，端口 5672
- 应用使用默认 `guest/guest` 连接成功
- 如需 CLI：设置 `ERLANG_HOME=C:\Program Files\Erlang OTP`，并把 `%ERLANG_HOME%\bin` 加入 PATH

### 启动尚品汇后端

MinIO/RabbitMQ 就绪后可直接：

```bash
cd D:/shang-pivot-automation-ls_v2_withxdist/backend
java -jar shang-server/target/shang-server-0.0.1-SNAPSHOT.jar
```

无需再关闭 RabbitMQ listener。
