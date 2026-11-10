# v3.6 平台并发会话隔离（shangpin 适配器）

## 问题

两个 worker 并发跑同一 target 时，偶发“尚品汇发送消息失败：会话已结束，请点击「新对话」继续咨询”。

根因：`shangpin.py` 的 `create_session` 使用 `?fresh=true`，但未携带 `X-Chat-Client-Key`；尚品汇把同一测试手机的所有进行中会话视为同一客户端，另一个 run 的 `fresh=true` 会结束当前 run 的会话。

## 修复

`create_session` 为每个平台 run 生成独立 `X-Chat-Client-Key=platform-<test_run_id>`，让 `fresh=true` 只结束本 run 自己的旧会话，不再互相干扰。

```python
headers={
  "Authorization": f"Bearer {token}",
  "Content-Type": "application/json",
  "X-Chat-Client-Key": f"platform-{test_run_id or new_id()}",
  **_test_headers(config, test_run_id),
}
```

## 验证（生产平台 2 workers）

| suite | target | 结果 |
|---|---|---|
| `v35-refcart` | graph | 50/50 |
| `v35-refcart` | legacy | 50/50 |
| `v36-refcart-auto` | graph | 30/30 |
| `v36-refcart-auto` | legacy | 30/30 |

修复前 2-worker 会偶发 `session ended` 假失败；修复后并发 50/50，无需降为单 worker。

## 部署

- 文件：`/opt/ai-test-platform/current/backend/app/agent_test/shangpin.py`
- 备份：`shangpin.py.bak-20261110`
- `systemctl restart ai-test-platform`，服务 active
