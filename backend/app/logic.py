from __future__ import annotations

import json
import random
import re
import string
from datetime import datetime
from typing import Any


def now_label() -> str:
    return datetime.now().strftime("%Y/%m/%d %H:%M:%S")


def uid(prefix: str) -> str:
    alphabet = string.ascii_uppercase + string.digits
    return f"{prefix}-{''.join(random.choices(alphabet, k=6))}"


def next_version(value: str) -> str:
    try:
        return f"v{int(str(value).replace('v', '')) + 1}"
    except ValueError:
        return "v2"


def next_numeric_id(items: list[dict[str, Any]], field: str, prefix: str, start: int = 1) -> int:
    numbers = []
    for item in items:
        raw = str(item.get(field, ""))
        match = re.search(r"(\d+)$", raw)
        if match:
            numbers.append(int(match.group(1)))
    return max(numbers + [start - 1]) + 1


OPENAPI_MEMBER = """openapi: 3.0.3
info:
  title: 会员中心 API
  version: 1.0.0
paths:
  /api/v1/member/profile:
    get:
      summary: 获取会员信息
      responses:
        '200':
          description: OK
  /api/v1/member/points:
    get:
      summary: 积分明细
  /api/v1/member/benefits/{id}/claim:
    post:
      summary: 领取权益"""

PROTOTYPE_MEMBER = {
    "flow": "首页 → 会员中心 → 权益详情 / 订单入口",
    "pages": [
        {
            "name": "会员中心",
            "sections": [
                {"name": "顶部导航", "items": ["Logo", "搜索", "头像"]},
                {"name": "会员卡片", "items": ["等级", "积分", "成长值进度"]},
                {"name": "权益列表", "items": ["免运费", "生日礼", "专属客服", "折扣券"]},
                {"name": "订单入口", "items": ["待付款", "待发货", "待收货", "售后"]},
            ],
        },
        {
            "name": "权益详情",
            "sections": [
                {"name": "权益信息", "items": ["权益名称", "有效期", "使用说明"]},
                {"name": "领取操作", "items": ["立即领取", "领取记录"]},
                {"name": "空状态", "items": ["暂无可领取权益"]},
            ],
        },
        {
            "name": "订单入口",
            "sections": [
                {"name": "订单筛选", "items": ["全部", "待付款", "待发货", "售后"]},
                {"name": "订单列表", "items": ["商品信息", "订单状态", "操作按钮"]},
                {"name": "空状态", "items": ["暂无订单"]},
            ],
        },
    ],
}


def member_endpoints() -> list[dict[str, Any]]:
    return [
        {"id": uid("API"), "method": "GET", "path": "/api/v1/member/profile", "summary": "获取会员信息", "status": "待调试", "source": "AI 导入", "module": "会员", "creator": "AI"},
        {"id": uid("API"), "method": "GET", "path": "/api/v1/member/points", "summary": "积分明细", "status": "待调试", "source": "AI 导入", "module": "会员", "creator": "AI"},
        {"id": uid("API"), "method": "POST", "path": "/api/v1/member/benefits/{id}/claim", "summary": "领取权益", "status": "待调试", "source": "AI 导入", "module": "会员", "creator": "AI"},
    ]


def generate_artifact(requirement: dict[str, Any], kind: str) -> dict[str, Any]:
    version = next_version(requirement.get("version", "v1"))
    result: dict[str, Any] = {
        "id": uid("GEN"),
        "kind": kind,
        "version": version,
        "createdAt": now_label(),
    }
    if kind == "prototype":
        prototype = json.loads(json.dumps(PROTOTYPE_MEMBER))
        result["prototype"] = prototype
        result["checks"] = [
            {"label": "覆盖 4/4 功能点", "status": "通过"},
            {"label": "组件命名规范", "status": "通过"},
            {"label": "缺少空状态设计", "status": "警告"},
        ]
        requirement["prototype"] = prototype
    else:
        endpoints = member_endpoints()
        result["yaml"] = OPENAPI_MEMBER
        result["endpoints"] = endpoints
        result["checks"] = [
            {"label": "OpenAPI 3.0 校验通过", "status": "通过"},
            {"label": "字段命名规范", "status": "通过"},
            {"label": "存在 1 个未定义错误码", "status": "警告"},
        ]
        requirement["apiYaml"] = OPENAPI_MEMBER
    requirement["version"] = version
    requirement["updatedAt"] = now_label()
    requirement.setdefault("generations", []).insert(0, result)
    return result


def parse_openapi(yaml: str) -> list[dict[str, str]]:
    out: list[dict[str, str]] = []
    path = ""
    for raw in yaml.splitlines():
        match = re.match(r"^\s{2}(/\S+):\s*$", raw)
        if match:
            path = match.group(1)
            continue
        match = re.match(r"^\s{4}(get|post|put|delete|patch):\s*$", raw, re.IGNORECASE)
        if match and path:
            out.append({"method": match.group(1).upper(), "path": path, "summary": ""})
            continue
        match = re.match(r"^\s{6}summary:\s*(.+)$", raw)
        if match and out and not out[-1]["summary"]:
            out[-1]["summary"] = match.group(1).strip()
    return out


def chat_reply(text: str) -> dict[str, Any]:
    wants_case = bool(re.search(r"用例|测试|覆盖", text))
    wants_api = bool(re.search(r"接口|api|openapi", text, re.IGNORECASE))
    if wants_api:
        content = (
            f"基于知识库检索到的 3 篇文档，建议将「{text}」设计为 3 个 RESTful 接口：\n\n"
            "1. GET /api/v1/member/profile — 获取会员基础信息与等级\n"
            "2. GET /api/v1/member/points — 分页查询积分明细\n"
            "3. POST /api/v1/member/benefits/{id}/claim — 领取权益，需做幂等校验\n\n"
            "字段命名统一使用 snake_case，错误码沿用平台 4xxxx 规范。"
        )
    elif wants_case:
        content = (
            f"检索到 3 篇相关文档。关于「{text}」，建议从正向流程、边界值、异常与安全四个维度设计用例，"
            "并优先覆盖 P0 链路：\n\n"
            "- 正向：会员等级、积分、成长值正确展示\n"
            "- 边界：积分为 0、成长值达到 100%\n"
            "- 异常：未登录领取权益、重复领取\n"
            "- 安全：越权查询他人积分"
        )
    else:
        content = (
            f"关于「{text}」，我在「业务规则说明.md」中检索到相关约束：优惠券叠加上限为 2 张，"
            "且最终优惠不超过订单金额 50%。建议先补充互斥规则用例，再验证退款分摊逻辑。"
        )
    message = {
        "id": uid("M"),
        "role": "assistant",
        "content": content,
        "citations": [
            {"doc": "业务规则说明.md", "chunk": "段落 12", "score": 0.92},
            {"doc": "会员权益手册.pdf", "chunk": "第 3 章", "score": 0.87},
            {"doc": "接口文档库 / member-api.yaml", "chunk": "paths./member/profile", "score": 0.81},
        ],
        "usage": {"prompt": 1280, "completion": 356},
    }
    if wants_case:
        message["toolCalls"] = [{"name": "knowledge.search", "args": json.dumps({"query": text, "top_k": 5}, ensure_ascii=False), "result": "3 chunks"}]
    return message


def data_tool_result(tool: dict[str, Any], params: dict[str, str]) -> str:
    count = min(int(params.get("count") or params.get("rows") or 3), 5)
    rows = [
        {"index": index + 1, "tool": tool["name"], "tag": tool["tag"], "value": f"{tool['tag']}-{str(index + 1).zfill(4)}"}
        for index in range(count)
    ]
    return json.dumps({"tool": tool["name"], "params": params, "rows": rows}, ensure_ascii=False, indent=2)


def recall_hits(query: str, top_k: int) -> list[dict[str, Any]]:
    hits = [
        "同一订单最多叠加 2 张优惠券，超出部分按优惠金额从高到低截断。",
        "满减券与折扣券不可同时使用；会员专享券可与平台券叠加。",
        "会员专享券可与平台券叠加，但最终优惠金额不得超过订单金额的 50%。",
        "退款时按各券分摊比例退回，已过期的券不返还。",
        "跨店铺下单时，店铺券仅作用于对应店铺商品金额。",
    ]
    return [
        {
            "doc": "业务规则说明.md",
            "chunkIndex": 12 + index,
            "content": f"{text}（查询：{query}）" if index == 0 else text,
            "score": round(0.92 - index * 0.07, 2),
        }
        for index, text in enumerate(hits[: max(1, min(top_k, len(hits)))])
    ]


def workflow_run(name: str, nodes: list[dict[str, Any]]) -> dict[str, Any]:
    states = {str(node["id"]): "success" for node in nodes}
    return {
        "id": uid("WR"),
        "workflow": name,
        "status": "已完成",
        "startedAt": now_label(),
        "nodeStates": states,
        "logs": [f"{node.get('type', '节点')} · {node.get('label', '')} 执行成功" for node in nodes],
    }
