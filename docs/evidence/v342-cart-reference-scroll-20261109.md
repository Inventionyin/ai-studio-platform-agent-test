# v3.4.2 上文商品加购与聊天滚动修复（生产证据）

## 版本

- 尚品汇：`b60b4a1`，tag `v3.4.2`
- 部署 jar SHA256：`53da12a968988e1b5844036180ad7275cceea1774a3e6dac8449c2bd291efaba`
- 数据库：无新迁移（沿用 V30）
- 平台：测试用例 232 条（新增 S06 × 2 target）

## 修复

1. **上文商品加购**
   - “我现在买”“现我买”“下单吧”等短句走 ADDCART，按上文卡片解析商品，不再走售前检索。
   - “把/帮我…上面那个/刚才那个/这个/它…加进购物车”走 ADDCART。
   - 商品名匹配去空格/中英文标点：“美的 风冷 冰箱”可匹配“美的风冷冰箱”。
   - “我要买冰箱 → 我现在买”实测生成冰箱加购待确认卡，不再返回联想/口红/AirPods 等无关商品。
2. **聊天滚动**
   - 消息区改为视口高度 + `min-height:0` 内部滚动，页脚始终在视口内。
   - 流式回答期间默认贴底；用户主动上翻后不强行拉回。
   - 一轮结束、商品图片加载、卡片渲染后做多次延迟贴底校正。
3. **数据集**
   - 新增 S06 `fridge-now-buy`：`我要买冰箱` → `我现在买`，期望 `cart-confirm:`、美的卡片、请确认，并禁止联想/口红/AirPods。
   - session-continuity 从 5 条增至 6 条。

## 生产验收

### Playwright（生产 HTTPS）

7/7 通过：

1. 商品详情返回恢复
2. 刷新恢复
3. 新对话真正新建
4. 人工体验入口恢复
5. H5 悬浮球恢复
6. **“我现在买”/“帮我把上面那个美的风冷冰箱加进购物车”生成加购确认卡**
7. **长对话消息区滚动到底部**

### 平台

| 验证 | 结果 |
|---|---|
| graph S06 | 1/1 pass |
| legacy S06 | 1/1 pass |
| graph 核心 20 条（v3.4.2） | 20/20，Judge 0.95 |
| legacy 核心 20 条（v3.4.2） | 20/20，Judge 0.963 |
| E04/E14（加购确认） | graph/legacy 均 pass |

### 本地

- `IntentRouterTest`：通过（新增“加进购物车/现在买/现我买”用例）
- `AgentGraphIntegrationTest`：8/8
- `GraphGoldenIntegrationTest`：2/2（200 条确定性断言）
- `ChatSessionLifecycleIntegrationTest`：8/8
- 商城 `npm run build`：通过
- 本地 AI E2E：7/7

## 部署

| 项 | 结果 |
|---|---|
| `shang-backend` | active，NRestarts=0，健康 200 |
| 备份 | `/opt/shang-pivot/backups/pre-v342-20261109-1029/`（jar/env/DB dump/web） |
| 前端备份 | `/var/www/shang.old-20261109-1029` |
| Flyway | v30 success |

## 回滚

```bash
cp /opt/shang-pivot/backups/pre-v342-20261109-1029/shang-server.jar /opt/shang-pivot/shang-server.jar
cp /opt/shang-pivot/backups/pre-v342-20261109-1029/.env /opt/shang-pivot/.env
rm -rf /var/www/shang
mv /var/www/shang.old-20261109-1029 /var/www/shang
systemctl restart shang-backend
```
