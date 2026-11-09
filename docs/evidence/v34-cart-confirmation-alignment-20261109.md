# v3.4.1 加购确认口径统一（Golden / 平台）

## 口径

- 金额 **达到 500 元** 或数量 **大于 1**：生成 `cart-confirm:` 待确认动作，不直接写购物车。
- 金额低于 500 且数量为 1：`cart:` 直接加购。
- 精确边界 500 元按确认处理（`CartConfirmationPolicyTest.amountAtThresholdRequiresConfirmation`）。

## 代码与数据

- 尚品汇：`736e590`，tag `v3.4.1`（仅测试/数据集，生产代码与 v3.4.0 相同）
- Golden 更新：
  - 确认：E04、E14、E41、E42、E70、E71、E72、E96、E167、E179–E184
  - 直接加购：E182（收纳盒 69 元 ×1）、E185（洁面乳 79 元 ×1）
- `scripts/eval/golden-200.jsonl` 已重新导出。
- `GraphGoldenIntegrationTest` 不再 mock `CartConfirmationPolicy`，用真实策略跑 200 条确定性断言。
- 平台 target 配置 `autoConfirmActions=false`，平台不再自动确认 addToCart。
- 平台 graph target 200 条、legacy target 20 条期望已按新口径更新。

## 验证

| 验证 | 结果 |
|---|---|
| 本地 `AgentEvalReportTest` 20 条 | **20/20**，Judge 均分 **0.98** |
| 本地 `GraphGoldenIntegrationTest` | 2/2（内部 200 条确定性断言） |
| `shang-server` 全量 | **30/30** |
| `shang-customerservice` 单测 | 通过 |
| 平台 graph E04/E14 | **2/2**，Judge 1.0 |
| 平台 legacy E04/E14 | **2/2**，Judge 0.95 |
| 平台 graph E182/E185（低于500直接加购） | **2/2** |
| 平台 graph 核心 20 条 | **20/20**，Judge 均分 0.94 |
| 平台 legacy 核心 20 条 | **20/20**，Judge 均分 0.953 |

## 说明

生产后端 v3.4.0 的 `CartConfirmationPolicy` 本来就是“金额 ≥500 或数量 >1 确认”，本次只统一测试期望和平台自动确认行为，不需要重新部署尚品汇后端/前端。
