from __future__ import annotations

import json

from fastapi import FastAPI, Request

app = FastAPI()


@app.post("/v1/chat/completions")
async def chat(request: Request) -> dict:
    body = await request.json()
    system = body["messages"][0]["content"]
    user = body["messages"][-1]["content"]
    if "资深助手" in system or "知识库片段" in system:
        content = f"（测试模型）根据知识库片段，关于「{user[:60]}」的建议是：先核对楼栋户号与账单状态，再走治理写入并保留审计。"
        return {"choices": [{"message": {"content": content}}], "usage": {"prompt_tokens": 120, "completion_tokens": 60}}
    if "需求分析师" in system:
        payload = {
            "children": [
                {"title": "会员等级与成长值展示", "description": "展示会员等级、当前积分与成长值进度", "priority": "P0", "points": ["等级展示", "成长值进度"]},
                {"title": "积分明细查询", "description": "分页查看积分获取与消耗记录", "priority": "P1", "points": ["分页", "筛选"]},
                {"title": "权益领取与幂等", "description": "领取权益并防止重复领取", "priority": "P0", "points": ["领取", "重复领取提示"]},
                {"title": "订单入口状态", "description": "展示待付款、待发货、售后入口及角标", "priority": "P1", "points": ["状态角标", "跳转"]},
            ]
        }
    elif "测试工程师" in system:
        payload = {
            "cases": [
                {"title": "会员等级正确展示", "module": "会员", "type": "正向", "priority": "P0", "precondition": "用户已登录", "steps": ["进入会员中心", "查看会员卡片"], "expected": "展示黄金会员与积分"},
                {"title": "积分为 0 时显示空状态", "module": "会员", "type": "边界", "priority": "P1", "precondition": "积分为 0", "steps": ["进入会员中心"], "expected": "展示空状态"},
                {"title": "重复领取权益幂等", "module": "会员", "type": "异常", "priority": "P1", "precondition": "已领取", "steps": ["再次领取"], "expected": "提示已领取"},
                {"title": "越权查询他人积分", "module": "会员", "type": "安全", "priority": "P0", "precondition": "已登录", "steps": ["修改 userId 查询积分"], "expected": "返回 403"},
            ]
        }
    else:
        payload = {"text": f"fake reply for: {user[:80]}"}
    return {"choices": [{"message": {"content": json.dumps(payload, ensure_ascii=False)}}], "usage": {"prompt_tokens": 100, "completion_tokens": 50}}
