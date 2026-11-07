# Shang Pivot AI 助手适配器契约（Phase 1）

## 1. 目标

把尚品汇（Shang Pivot）V3.0 智能客服作为我们的被测 Agent：
- 远程：`https://shang.bettery.cn`（V3.0 legacy，黑盒 SSE）
- 本地：V3.1 graph（后续，拿 `runId` 后导入内部 trace）

## 2. 新增 adapterType

`agent_targets.adapter_type` 增加 `shangpin`。

Target config：

```json
{
  "baseUrl": "https://shang.bettery.cn",
  "adminBaseUrl": "https://admin.bettery.cn",
  "customerPhones": ["13900009999", "13900009998"],
  "smsCode": "123456",
  "clientType": "h5",
  "throttleMs": 1200,
  "rateLimitWaitSeconds": 120,
  "cartCleanup": true,
  "engine": "legacy",
  "adminUsername": "admin",
  "adminPassword": ""
}
```

- `engine=legacy`：只做 SSE 黑盒。
- `engine=graph`：额外用 `adminBaseUrl` 登录，`GET /admin/customer-service/agent-runs/{runId}` 拉内部 trace。
- 敏感字段只从本地配置读取，不写入仓库/文档。

## 3. SSE 协议

发送：`POST {baseUrl}/api/chat/sessions/{sessionId}/messages`，body `{"content":"..."}`，`text/event-stream`。

事件：
- `reasoning` → `{delta}`
- `delta` → `{delta}`
- `cards` → `{items:[...]}`
- `action` → 待确认动作（记录，不自动执行）
- `done` → `{messageId, sessionStatus, degraded, sources, tokens, runId?, agent?, intent?, tools?}`
- `error` → `{code,msg}`

多轮：按 `case.turns` 顺序发送，每轮结果都保存。

限流：HTTP 200 + JSON 且 msg 包含“发送太频繁”时，等待 `rateLimitWaitSeconds` 后重试，最多 2 次；支持手机号轮换。

## 4. 数据模型

### agent_test_cases
新增 `turns` JSONB，默认 `[]`。为空时用 `[command]`。

### agent_runs
新增 `conversation` JSONB，默认 `[]`。每轮：

```json
{
  "input": "...",
  "answer": "...",
  "reasoning": "...",
  "cards": [{"spuId":"104","name":"Redmi K70..."}],
  "sources": ["retrieval:vector", "product:104"],
  "tokens": {"prompt": 100, "completion": 50},
  "degraded": false,
  "runId": 123,
  "agent": "SHOPPING_GUIDE",
  "intent": "PRODUCT_SEARCH",
  "tools": ["search_products"],
  "sessionStatus": "AI_ONGOING",
  "latencyMs": 1234
}
```

`final_output` 同时冗余最后一轮：`answer/cards/sources/tokens/degraded/runId/agent/intent/tools/cartState`。

## 5. Trace 归一化

`AdapterResult` 增加 `conversation`；`trace` 增加 `custom_spans` 或 `turns`。

黑盒 span：
- 每轮 `command`：input = turn
- 每轮 `sse`：input = turn，output = answer/cards/sources/tokens/degraded，latency
- 最后 `final`：output = last answer/cards/sources
- 如果有 `runId` + admin trace：追加 `agent/llm/tool/retrieval` spans，parent 指向最后一个 agent span。

## 6. 规则扩展

新增 checks：
- `source_contains`：`sources` 任一包含 expected；`expected="retrieval"` 时匹配 `vector|lexical|retrieval`
- `source_not_contains`
- `card_contains` / `card_not_contains`
- `cart_quantity`：`{ "title": "Redmi K70", "quantity": 2 }`
- `forbid_pattern`：等价 `not_contains`
- `max_sources`
- `degraded_false`

## 7. Golden 导入

源：`D:\shang-pivot-automation-ls_v2_withxdist\backend\shang-customerservice\src\test\java\com\shangpivot\customerservice\eval\GoldenDataset.java`（20 条）。

导入脚本：`backend/scripts/import_shangpin_golden.py`
数据文件：`backend/scripts/data/shangpin_golden.json`

每条 Golden 映射：
```json
{
  "id": "E01-presale-phone-budget",
  "businessRule": "...",
  "turns": ["..."],
  "sources": ["retrieval"],
  "maxSources": 3,
  "cards": ["Redmi K70"],
  "cart": [{"title": "Redmi K70", "quantity": 1}],
  "answerKeywords": ["2299"],
  "forbid": ["..."],
  "judge": {"enabled": true, "threshold": 0.7, "steps": ["..."]}
}
```

导入脚本生成 `checks`：
- `source_contains` × sources
- `max_sources`
- `card_contains` × cards
- `cart_quantity` × cart
- `contains` × answerKeywords
- `forbid_pattern` × forbid
- `degraded_false`
- `max_sources=0` 时检查 sources 为空

优先导入 5 条冒烟：E01、E04、E07、E09、E06；全量 20 条。

## 8. 前端

- `AgentAdapterType` 增加 `"shangpin"`。
- `AgentTargetConfig` 增加 `customerPhones/smsCode/clientType/throttleMs/engine/adminBaseUrl` 等。
- `AgentCase` 增加 `turns: string[]`。
- `AgentRun` 增加 `conversation: ConversationTurn[]`。
- 用例弹窗增加“多轮输入”textarea（每行一轮）。
- target 新建预设“Shang Pivot 智能客服”，自动填 baseUrl/phones/smsCode。
- Trace 详情增加“对话轮次”卡片：每轮输入、回答、cards、sources、tokens、degraded。
- 运行列表显示轮次数/最终状态。

## 9. 测试

- `parse_sse` 单测：reasoning/delta/cards/done/error。
- Mock Shang Pivot 服务 fixture：登录/建会话/SSE/购物车；多轮；限流一次。
- Adapter 集成测试：多轮 case → conversation 3 轮 → final_output。
- 规则测试：source/card/cart/forbid/maxSources。
- Golden 导入测试：20 条数量、字段完整。
- 远程冒烟脚本：`backend/scripts/run_shangpin_smoke.py`（5 条）。
