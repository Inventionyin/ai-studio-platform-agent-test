# Agent 全链路追踪 · P0/P1 实现契约

> 本文件是后端、前端、测试并行实现的唯一接口契约。所有模块按此文件实现，避免并行冲突。

## 1. 范围

- 被测对象：外部 Agent（HTTP / CLI）。
- 首期：mock Agent + 本地跑通。
- 判定：规则 + wb2api LLM Judge + 人工评审。
- 修复：失败 → 修复工单 → 回归 → 生成 `docs/fix-experience/v1.0---<名称>-fix经验积累.md`。
- WebUI/App：P2/P3 通过适配器接入，本期只预留类型与页面入口。

## 2. 数据库表

统一使用字符串 ID（如 `AT-xxxx`、`AC-xxxx`、`AR-xxxx`、`SP-xxxx`、`FX-xxxx`），时间字段使用 `DateTime(timezone=True)`，JSON 字段使用 PostgreSQL `JSONB`。

### agent_targets
| 字段 | 类型 | 说明 |
|---|---|---|
| id | String(40) PK | 目标 ID |
| project_id | FK projects.id | 项目隔离 |
| name | String(120) | 名称 |
| adapter_type | String(20) | http / cli / webui / app |
| description | Text | 描述 |
| config | JSONB | baseUrl / command / args / env / timeout / headers |
| status | String(20) | 启用 / 停用 |
| created_by | String(40) | 创建人 |
| created_at / updated_at | DateTime | 时间 |

### agent_test_cases
| 字段 | 类型 | 说明 |
|---|---|---|
| id | String(40) PK | 用例 ID |
| project_id | FK projects.id | 项目 |
| target_id | FK agent_targets.id nullable | 默认目标 |
| name | String(200) | 用例名 |
| input_type | String(20) | text / json / cli |
| command | Text | 给 Agent 的命令/消息 |
| payload | JSONB | 结构化输入 |
| expected | JSONB | 期望：status/intent/agent/answer/tools/retrieval |
| checks | JSONB | 规则检查数组 |
| tags | JSONB | 标签 |
| priority | String(4) | P0/P1/P2 |
| enabled | Boolean | 是否启用 |
| version | String(10) | 默认 v1.0 |
| created_by / created_at / updated_at | | |

### agent_runs
| 字段 | 类型 | 说明 |
|---|---|---|
| id | String(40) PK | 运行 ID |
| project_id | FK projects.id | 项目 |
| target_id | FK agent_targets.id | 目标 |
| case_id | FK agent_test_cases.id | 用例 |
| trace_id | String(64) unique index | 全链路 ID |
| status | String(20) | pending / running / pass / fail / needs_review / error |
| input | JSONB | 实际输入 |
| final_output | JSONB | 最终回答/结果 |
| verdict | JSONB | 聚合判定 |
| error | Text | 错误 |
| latency_ms | Integer | 耗时 |
| total_tokens | Integer | token |
| started_at / finished_at | DateTime | |
| triggered_by | String(40) | 触发人 |
| created_at | DateTime | |

### trace_spans
| 字段 | 类型 | 说明 |
|---|---|---|
| id | String(40) PK | span ID |
| trace_id | String(64) index | trace |
| run_id | FK agent_runs.id index | 运行 |
| parent_span_id | String(40) nullable | 父 span |
| span_type | String(30) | command / agent / llm / tool / retrieval / final / judge / ui / assertion |
| name | String(200) | 名称 |
| status | String(20) | ok / error / skipped |
| input | JSONB | 入参 |
| output | JSONB | 出参 |
| error | Text | 错误 |
| started_at / ended_at | DateTime | |
| latency_ms | Integer | 耗时 |
| attributes | JSONB | 扩展 |

### trace_artifacts
| 字段 | 类型 | 说明 |
|---|---|---|
| id | String(40) PK | |
| trace_id | String(64) index | |
| run_id | FK agent_runs.id | |
| span_id | String(40) nullable | |
| artifact_type | String(30) | screenshot / video / trace / log / json |
| name | String(200) | |
| path | String(500) | 本地路径/URL |
| mime | String(100) | |
| size | Integer | |
| created_at | DateTime | |

### run_evaluations
| 字段 | 类型 | 说明 |
|---|---|---|
| id | String(40) PK | |
| run_id | FK agent_runs.id index | |
| evaluator_type | String(20) | rule / llm / human |
| verdict | String(20) | pass / fail / needs_review / unavailable |
| score | Float nullable | 0-1 |
| checks | JSONB | 检查明细 |
| comment | Text | 说明 |
| model | String(100) | LLM 模型 |
| prompt / response | Text | LLM 入参/出参 |
| created_by | String(40) nullable | |
| created_at | DateTime | |

### fix_records
| 字段 | 类型 | 说明 |
|---|---|---|
| id | String(40) PK | |
| project_id | FK projects.id | |
| run_id | FK agent_runs.id | 失败运行 |
| case_id | FK agent_test_cases.id nullable | |
| target_id | FK agent_targets.id nullable | |
| title | String(200) | 问题名 |
| slug | String(120) | 文件名片段 |
| severity | String(20) | P0/P1/P2 |
| category | String(30) | prompt / tool / retrieval / model / data / code / environment |
| fix_target | String(30) | agent / platform / test_data |
| symptom | Text | 现象 |
| root_cause | Text | 根因 |
| fix_action | Text | 修复动作 |
| changed_files | JSONB | 文件列表 |
| before_run_id | String(40) | 修复前 |
| after_run_id | String(40) | 修复后 |
| status | String(20) | open / in_progress / fixed / verified / closed / reopened |
| doc_path | String(500) | 生成的 md 路径 |
| ai_suggestion | Text | LLM 修复建议 |
| created_by / created_at / updated_at | | |

## 3. API 契约

前缀 `/api/v1/agent-test`，全部需要 `X-Project-Id`；读写权限沿用 `project_scope / project_editor_scope / project_reviewer_scope`。

### Target
- `GET /targets` → `AgentTarget[]`
- `POST /targets` body `{name, adapterType, description?, config?}` → `AgentTarget`
- `PUT /targets/{id}` body 同上 → `AgentTarget`
- `DELETE /targets/{id}` → `null`
- `POST /targets/{id}/health` → `{ok, detail}`

### Case
- `GET /cases` → `AgentCase[]`
- `POST /cases` body `{name, targetId?, inputType, command, payload?, expected?, checks?, tags?, priority?}` → `AgentCase`
- `PUT /cases/{id}` → `AgentCase`
- `DELETE /cases/{id}` → `null`

### Run
- `POST /runs` body `{caseId, targetId?}` → `RunDetail`（同步执行，MVP）
- `GET /runs?caseId=&targetId=&status=` → `AgentRun[]`
- `GET /runs/{id}` → `RunDetail`
- `POST /runs/{id}/rerun` → `RunDetail`
- `POST /runs/{id}/evaluate` body `{evaluatorType:"rule"|"llm"|"human", verdict?, comment?, score?}` → `{evaluations: RunEvaluation[], run: AgentRun}`

`RunDetail = { run: AgentRun, spans: TraceSpan[], artifacts: TraceArtifact[], evaluations: RunEvaluation[] }`

### Fix
- `GET /fixes` → `FixRecord[]`
- `POST /fixes` body `{runId, title, severity?, category?, fixTarget?, symptom?, rootCause?, fixAction?, changedFiles?}` → `FixRecord`
- `PUT /fixes/{id}` body 同上 → `FixRecord`
- `POST /fixes/{id}/regression` body `{afterRunId}` → `{fix: FixRecord, before: RunDetail, after: RunDetail, comparison: object}`
- `POST /fixes/{id}/generate-doc` → `FixRecord`（写入 `docPath`）

### Docs / Summary
- `GET /docs` → `{name, path, size, updatedAt}[]`
- `GET /docs/{name}` → `{name, content}`
- `GET /summary` → `{targets, cases, runs, passRate, failCount, needsReviewCount, fixes, docs}`

## 4. Trace 归一化

Agent 服务返回的 trace 结构兼容现有 `agent_eval`：

```json
{
  "run_id": "run-1",
  "trace_id": "trace-1",
  "message": "帮我找帐篷",
  "intent": "product_search",
  "agent": "ShoppingGuideAgent",
  "status": "ok",
  "answer": "推荐...",
  "llm_calls": [{"node":"planner","model":"...","prompt":"...","response":"...","latency_ms":12,"at":"..."}],
  "tool_calls": [{"name":"searchProducts","args":{},"result":{},"status":"ok","latency_ms":8,"at":"..."}],
  "retrievals": [{"query":"...","backend":"pgvector","hits":[{"title":"...","source":"...","score":0.9}],"fallback":false,"error":null,"at":"..."}],
  "steps": [{"name":"route","status":"ok","at":"...","detail":{}}],
  "latency_ms": 100
}
```

归一化 span：
- `command`：input.command，output 空
- `agent`：input message，output `{intent, agent, status}`
- `llm`：name=`LLM · {node}`，input `{prompt}`，output `{response, model}`，latency
- `tool`：name=`工具 · {name}`，input `{args}`，output `{result}`，status
- `retrieval`：name=`检索 · {backend}`，input `{query}`，output `{hits, fallback, error}`
- `final`：output `{answer, status, tools}`

## 5. 规则检查

`checks` 为数组，支持：

| type | 参数 | 说明 |
|---|---|---|
| status | expected | 期望最终状态 |
| intent | expected | 期望意图 |
| agent | expected | 期望 Agent |
| tool_called | expected | 必须调用的工具 |
| tool_not_called | expected | 禁止调用的工具 |
| retrieval_hit | expected | 检索命中关键词 |
| contains | expected | 回答包含 |
| not_contains | expected | 回答不包含 |
| regex | expected | 回答正则 |
| latency | expected | 如 `<5000` |
| no_secret | - | 不包含手机号/Token |
| grounded | - | 回答事实能在工具/检索证据中找到（基础词重叠） |

返回：
```json
{"verdict":"pass|fail","score":0.0,"checks":[{"label":"...","passed":true,"detail":"...","evidenceSpanIds":["SP-1"]}]}
```

## 6. LLM Judge

- 仅当 `JUDGE_API_KEY` 存在时启用；模型默认 `deepseek-v4.1-flash`。
- 调用 OpenAI 兼容 `/chat/completions`，`temperature=0`，优先使用 `tools` + `tool_choice=submit_evaluation` 强制结构化输出；同时保留 `response_format={"type":"json_object"}` 与中英文键名归一化作为兜底。
- 输出 JSON：`{verdict, score, reasons, evidence, missing_facts, hallucination}`。
- 失败/超时 → `verdict=unavailable`，不默认通过。
- 每次 Judge 生成一个 `judge` span，保存 prompt/response。

## 7. 修复文档

- 目录：`docs/fix-experience`
- 文件名：`v1.0---{slug}-fix经验积累.md`
- slug：中文/字母/数字/短横线，去掉 `\/:*?"<>|`，最长 60。
- 已存在则追加 `## 修复轮次 N`；同时维护 `README.md` 索引。
- 章节：基本信息 / 问题现象 / 复现方式 / 链路追踪 / 根因分析 / 修复方案 / 回归验证 / 经验总结 / 附件。

## 8. 前端

- 路由：`/project/:pid/tasks/agent-test`
- 菜单：任务与报告 → Agent 测试
- Tab：测试用例 / 运行控制台 / Trace 详情 / 修复工作台 / 经验文档
- 组件：
  - `src/api/agent-test.ts`
  - `src/pages/project/AgentTest.tsx`
  - `src/components/business/AgentTestCasePanel.tsx`
  - `src/components/business/AgentRunPanelV2.tsx`
  - `src/components/business/AgentTraceDetail.tsx`
  - `src/components/business/AgentVerdictPanel.tsx`
  - `src/components/business/AgentFixPanel.tsx`
  - `src/components/business/AgentDocPanel.tsx`
  - `src/components/business/TraceTimeline.tsx`
- 复用 `Card / Btn / Tag / Table / Toolbar / Field / Input / Select / Textarea / Modal / Empty / Stat`；不引入第三方 UI 库。

## 9. Mock Agent 场景

`backend/scripts/mock_agent_service.py`，端口 8088：

- `success`：意图/Agent/工具/检索/回答全部正确
- `wrong_intent`：意图错误
- `missing_tool`：缺少工具
- `empty_retrieval`：检索为空
- `hallucination`：回答含证据中没有的事实
- `need_auth`：返回 need_auth
- `timeout`：延迟 3 秒（用于超时测试）
- `malformed`：返回非 JSON（适配器错误）
- `fixed`：修复后的正确版本

`POST /agent/chat` body `{message, scenario?}`；`GET /agent/runs/{run_id}` 返回 trace。

## 10. 完成标准

- 本地 PostgreSQL 55432、后端 8000、mock Agent 8088 可启动。
- 创建 target/case → 运行 → trace 落库 → 规则判定 → LLM Judge → 人工评审。
- 失败 → 修复工单 → 回归 → 生成 md。
- `pnpm exec tsc --noEmit`、`pnpm test`、后端 pytest 通过。
