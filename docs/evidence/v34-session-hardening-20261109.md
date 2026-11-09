# v3.4.0 会话生命周期加固（生产证据）

## 版本

- 尚品汇代码：`1d68bd0`，tag `v3.4.0`
- 部署 jar SHA256：`79bfabf97d91b4e6c0e4571cfc14d9111388a3797cfee9a445613a7206a55624`
- 数据库：Flyway V29（idle timeout）+ V30（client_key）
- 平台：代码未变；测试用例仍为 230 条（含 v33-session 5 条 × 2 target）

## 本次补强

| 问题 | 处理 |
|---|---|
| 超时后返回显示新会话但无解释 | `POST /sessions` 返回 `resumed`/`previousSessionId`；前端显示“上一场已结束，已开启新会话”+历史入口 |
| 历史加载失败仍能发送 | 历史失败态禁用输入，显示“重新加载” |
| 待确认写操作不恢复 | 新增 `GET /api/chat/sessions/{id}` 状态接口，回放未过期 `pendingAction` 卡片 |
| 并发创建产生两条 active | Redis `create` 互斥锁，5 并发实测返回同一 sessionId |
| 测试标记可伪造/残留 | `AGENT_TEST_ALLOWED_PHONES` 白名单；登录/登出/401 清测试标记 |
| 自动结束页面无感知 | 前端 30s 状态轮询；ENDED 后禁用输入；后端 ENDED 直接拒绝新消息，不再静默落旧会话 |
| 多端/多标签串会话 | `X-Chat-Client-Key` + `chat_session.client_key` 分端隔离 |
| 历史 >50 条 | 前端“加载更早消息”分页，保持滚动位置 |
| 历史思考链暴露 | 历史回放不返回 `reasoning` |
| 历史商品卡过期 | 历史卡片标注“价格/库存以详情页为准” |
| 空闲判定误杀 | 调度 SQL 以 `MAX(message.created_at)` 兜底，`last_message_at` 刷新失败也不会结束正在聊的会话 |
| H5 未覆盖 | 新增 H5 悬浮球 E2E 场景 |

## 部署

| 项 | 结果 |
|---|---|
| `shang-backend` | `active`，NRestarts=0，健康 200 |
| `/api/home` | 200 |
| Flyway | V30 `success=t`，`client_key` 列存在 |
| 商城前端 | 新 dist 已发布；旧目录 `shang.old-20261109-0858` |
| 备份 | `/opt/shang-pivot/backups/pre-v34-20261109-0858/`（jar/env/DB dump/web） |
| 测试账号白名单 | `13900008881`–`13900008886` |

## 生产验收

### 1. Playwright E2E（生产 HTTPS）

5/5 通过：

1. 商品卡 → 详情 → 返回恢复；
2. 刷新 `/ai` 恢复；
3. 新对话真正新建、旧会话保留历史；
4. `/ai?test=human` 返回恢复；
5. **H5 悬浮球**进入后商品详情返回恢复。

### 2. 分端隔离 / 白名单

- 同一账号 `client_key=device-A/B` 得到不同 sessionId；同 key 复用同一 sessionId；
- 允许账号携带 `X-Agent-Test: human` → `testSource=human`；
- 非白名单账号携带同一头 → `testSource=""`，不污染测试数据。

### 3. 并发创建

5 个并发 `POST /api/chat/sessions`（同账号同 client_key）→ 全部返回同一 sessionId。

### 4. 待确认动作状态

`来两台 Redmi K70` → `cart-confirm:10008`；`GET /api/chat/sessions/{id}` 返回非空 `pendingAction`。

### 5. 空闲兜底

将 `last_message_at` 人为回填为 31 分钟前，但消息表仍有刚刚的消息；生产调度连续 15 次轮询（约 75 秒）仍为 `AI_ONGOING`，未被误结束。

### 6. 本地回归

- `ChatSessionLifecycleIntegrationTest`：8/8
- `shang-server` 全量：30/30
- `shang-customerservice` 单测：通过
- 商城 `npm run build`：通过
- 本地 AI E2E：5/5

## 回滚

```bash
cp /opt/shang-pivot/backups/pre-v34-20261109-0858/shang-server.jar /opt/shang-pivot/shang-server.jar
cp /opt/shang-pivot/backups/pre-v34-20261109-0858/.env /opt/shang-pivot/.env
rm -rf /var/www/shang
mv /var/www/shang.old-20261109-0858 /var/www/shang
systemctl restart shang-backend
```

- V30 只新增列/索引，旧 jar 可忽略；如需彻底回退数据库，使用 `pre-v34-20261109-0858/shang.dump`。
- 前端 `index.html` 已 no-cache，assets 带哈希。

## 已知既有口径（非本次回归）

`AgentEvalReportTest` 的加购类 Golden（E04/E14 等）与 2026-11-08 新增的加购二次确认策略冲突（金额/数量阈值）；本次未改 Golden 期望值，也未关闭确认策略。确定性图测试通过 mock 策略验证底层加购路径，策略本身由 `CartConfirmationPolicyTest` 覆盖。
