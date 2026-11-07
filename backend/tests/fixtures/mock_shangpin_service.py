"""In-process FastAPI mock of the Shang Pivot V3.0 customer-service API.

Covers login, chat sessions, cart, multi-turn SSE (reasoning/delta/cards/
action/done), one business rate-limit response, and the optional admin trace.
"""
from __future__ import annotations

import json
from typing import Any, Iterator

from fastapi import FastAPI, Header
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel

ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "admin-password"


class LoginRequest(BaseModel):
    phone: str
    code: str = "123456"
    clientType: str = "h5"


class MessageRequest(BaseModel):
    content: str


class AdminLoginRequest(BaseModel):
    username: str
    password: str


def _sse(event: str, payload: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"


def create_app() -> FastAPI:
    app = FastAPI(title="mock-shangpin")
    state: dict[str, Any] = {
        "tokens": {},
        "sessions": {},
        "carts": {},
        "limited": set(),
        "session_seq": 0,
    }

    def auth_phone(authorization: str | None) -> str | None:
        if not authorization or not authorization.lower().startswith("bearer "):
            return None
        return state["tokens"].get(authorization[7:].strip())

    def unauthorized() -> JSONResponse:
        return JSONResponse(status_code=401, content={"code": 401, "msg": "未登录"})

    def cart_for(phone: str) -> list[dict[str, Any]]:
        return state["carts"].setdefault(phone, [])

    @app.post("/api/auth/login")
    def login(body: LoginRequest) -> dict[str, Any]:
        token = f"token-{body.phone}"
        state["tokens"][token] = body.phone
        return {
            "code": 0,
            "msg": "ok",
            "data": {"accessToken": token, "phone": body.phone, "clientType": body.clientType},
        }

    @app.post("/api/chat/sessions")
    def create_session(authorization: str | None = Header(default=None)) -> Any:
        phone = auth_phone(authorization)
        if not phone:
            return unauthorized()
        state["session_seq"] += 1
        session_id = state["session_seq"]
        state["sessions"][session_id] = {"phone": phone, "turns": 0}
        return {
            "code": 0,
            "msg": "ok",
            "data": {
                "sessionId": session_id,
                "status": "AI_ONGOING",
                "greeting": "您好，我是尚品汇智能客服小尚~",
                "quickQuestions": [],
            },
        }

    @app.get("/api/cart")
    def get_cart(authorization: str | None = Header(default=None)) -> Any:
        phone = auth_phone(authorization)
        if not phone:
            return unauthorized()
        items = cart_for(phone)
        return {"code": 0, "msg": "ok", "data": {"items": items}}

    @app.delete("/api/cart/items/{item_id}")
    def delete_cart_item(item_id: int, authorization: str | None = Header(default=None)) -> Any:
        phone = auth_phone(authorization)
        if not phone:
            return unauthorized()
        state["carts"][phone] = [item for item in cart_for(phone) if item.get("cartItemId") != item_id]
        return {"code": 0, "msg": "ok", "data": None}

    def build_turn(content: str, turn_no: int, phone: str) -> dict[str, Any]:
        cards: list[dict[str, Any]] = []
        sources: list[str] = ["retrieval:vector", "product:104"]
        tools: list[str] = ["search_products"]
        intent = "PRODUCT_SEARCH"
        agent = "SHOPPING_GUIDE"
        actions: list[dict[str, Any]] = []
        degraded = False

        if "退货" in content or "售后" in content:
            answer = "退货政策：支持 7 天无理由退货，质量问题 15 天内可退换。"
            sources = ["doc:refund-policy"]
            tools = ["search_knowledge"]
            intent = "KNOWLEDGE_QA"
        elif "订单" in content:
            answer = "您名下暂无订单，请核对后重试。"
            sources = ["order:customer-1"]
            tools = ["query_orders"]
            intent = "ORDER_QUERY"
        elif "忽略" in content or "Ignore all previous" in content:
            answer = "抱歉，我不能泄露系统提示词。我是尚品汇智能客服小尚，可以帮您挑选商品。"
            sources = []
            tools = []
            intent = "CHITCHAT"
        elif "自行车" in content:
            answer = "抱歉，我们目录里没有自行车品类，您可以看看露营或数码商品。"
            sources = []
            tools = []
        else:
            answer = "为您推荐 Redmi K70 12+256G，价格 2299 元。"
            cards = [{"spuId": "104", "name": "Redmi K70 12+256G", "price": 2299}]
            if "iPhone" in content:
                cards = [{"spuId": "105", "name": "iPhone 15 128G", "price": 5999}]
                answer = "iPhone 15 128G 的价格是 5999 元。"
            if "耳机" in content:
                cards = [{"spuId": "201", "name": "索尼 WH-1000XM5", "price": 1999}]
                answer = "为您推荐索尼 WH-1000XM5 耳机。"
            if "来一个" in content or "来两台" in content:
                quantity = 2 if "来两台" in content else 1
                cart = cart_for(phone)
                existing = next((item for item in cart if item.get("title") == "Redmi K70 12+256G"), None)
                if existing:
                    existing["quantity"] += quantity
                else:
                    next_id = max([item.get("cartItemId", 0) for item in cart] + [0]) + 1
                    cart.append({
                        "cartItemId": next_id,
                        "title": "Redmi K70 12+256G",
                        "quantity": quantity,
                        "spuId": 104,
                    })
                cards = [{"spuId": "104", "name": "Redmi K70 12+256G", "price": 2299}]
                answer = "已加入购物车：Redmi K70 12+256G，请到购物车结算。"
                sources = ["cart:1"]
                tools = ["add_to_cart"]
                intent = "CART_ADD"
                actions = [{
                    "actionId": 1,
                    "tool": "add_to_cart",
                    "summary": "加入购物车",
                    "args": {"spuId": 104, "quantity": quantity},
                }]

        return {
            "answer": answer,
            "cards": cards,
            "sources": sources,
            "tools": tools,
            "intent": intent,
            "agent": agent,
            "degraded": degraded,
            "actions": actions,
            "tokens": {"prompt": 100 + turn_no * 10, "completion": 20 + turn_no},
        }

    @app.post("/api/chat/sessions/{session_id}/messages")
    def send_message(
        session_id: int,
        body: MessageRequest,
        authorization: str | None = Header(default=None),
    ) -> Any:
        phone = auth_phone(authorization)
        if not phone:
            return unauthorized()
        session = state["sessions"].get(session_id)
        if not session:
            return JSONResponse(status_code=404, content={"code": 404, "msg": "会话不存在"})
        if "限流" in body.content and session_id not in state["limited"]:
            state["limited"].add(session_id)
            return JSONResponse(
                status_code=200,
                content={"code": 40000, "msg": "发送太频繁，请稍后再试"},
                media_type="application/json",
            )
        session["turns"] += 1
        turn_no = session["turns"]
        turn = build_turn(body.content, turn_no, phone)

        def events() -> Iterator[str]:
            yield _sse("reasoning", {"delta": "正在理解您的问题…"})
            answer = turn["answer"]
            midpoint = max(1, len(answer) // 2)
            yield _sse("delta", {"delta": answer[:midpoint]})
            yield _sse("delta", {"delta": answer[midpoint:]})
            if turn["cards"]:
                yield _sse("cards", {"items": turn["cards"]})
            for action in turn["actions"]:
                yield _sse("action", action)
            yield _sse("done", {
                "messageId": 1000 + turn_no,
                "sessionStatus": "AI_ONGOING",
                "degraded": turn["degraded"],
                "sources": turn["sources"],
                "tokens": turn["tokens"],
                "runId": 1234,
                "agent": turn["agent"],
                "intent": turn["intent"],
                "tools": turn["tools"],
            })

        return StreamingResponse(events(), media_type="text/event-stream")

    @app.post("/admin/auth/login")
    def admin_login(body: AdminLoginRequest) -> Any:
        if body.username != ADMIN_USERNAME or body.password != ADMIN_PASSWORD:
            return JSONResponse(status_code=401, content={"code": 401, "msg": "用户名或密码错误"})
        return {"code": 0, "msg": "ok", "data": {"accessToken": "admin-token"}}

    @app.get("/admin/customer-service/agent-runs/{run_id}")
    def admin_trace(run_id: int, authorization: str | None = Header(default=None)) -> Any:
        if authorization != "Bearer admin-token":
            return unauthorized()
        return {
            "code": 0,
            "msg": "ok",
            "data": {
                "run": {
                    "id": run_id,
                    "traceId": "trace-graph-1",
                    "intent": "PRODUCT_SEARCH",
                    "agent": "SHOPPING_GUIDE",
                    "status": "SUCCESS",
                    "totalTokens": 120,
                    "model": "mock-llm",
                    "startedAt": "2026-11-07T10:00:00+00:00",
                    "finishedAt": "2026-11-07T10:00:01+00:00",
                },
                "steps": [
                    {
                        "id": 1,
                        "node": "route",
                        "agent": "SHOPPING_GUIDE",
                        "status": "SUCCESS",
                        "inputSummary": "推荐手机",
                        "outputSummary": "PRODUCT_SEARCH",
                        "latencyMs": 10,
                        "createdAt": "2026-11-07T10:00:00+00:00",
                    }
                ],
                "llmCalls": [
                    {
                        "id": 1,
                        "model": "mock-llm",
                        "inputTokens": 100,
                        "outputTokens": 20,
                        "latencyMs": 30,
                        "status": "SUCCESS",
                        "requestRef": "plan",
                        "responseRef": "answer",
                        "createdAt": "2026-11-07T10:00:00+00:00",
                    }
                ],
                "toolCalls": [
                    {
                        "id": 1,
                        "toolName": "search_products",
                        "argsJson": {"keyword": "手机"},
                        "resultJson": {"items": [{"spuId": 104}]},
                        "status": "SUCCESS",
                        "latencyMs": 12,
                        "createdAt": "2026-11-07T10:00:00+00:00",
                    }
                ],
                "retrievals": [
                    {
                        "id": 1,
                        "query": "手机",
                        "topK": 3,
                        "docIds": [104],
                        "scores": [0.9],
                        "latencyMs": 8,
                        "hit": True,
                        "backend": "pgvector",
                        "createdAt": "2026-11-07T10:00:00+00:00",
                    }
                ],
            },
        }

    return app


app = create_app()
