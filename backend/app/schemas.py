from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class RequirementCreate(BaseModel):
    title: str = Field(min_length=1)
    priority: Literal["P0", "P1", "P2"] = "P1"
    description: str = ""
    owner: str = "张伟"
    docName: str | None = None


class GenerateRequest(BaseModel):
    kind: Literal["prototype", "api"]


class YamlSave(BaseModel):
    yaml: str


class TestCaseCreate(BaseModel):
    title: str = Field(min_length=1)
    module: str = "会员"
    type: str = "正向"
    priority: Literal["P0", "P1", "P2"] = "P1"
    precondition: str = ""
    steps: list[str] = Field(default_factory=list)
    expected: str = ""
    source: str = "手工"
    owner: str = "张伟"


class TestCaseUpdate(BaseModel):
    title: str | None = None
    module: str | None = None
    type: str | None = None
    priority: Literal["P0", "P1", "P2"] | None = None
    status: str | None = None
    version: str | None = None
    precondition: str | None = None
    steps: list[str] | None = None
    expected: str | None = None
    source: str | None = None
    owner: str | None = None


class GenerateCasesRequest(BaseModel):
    source: str = "需求文档"
    requirementId: str | None = None


class ReviewSubmit(BaseModel):
    cases: list[dict[str, Any]] = Field(default_factory=list)


class ReviewDecision(BaseModel):
    action: Literal["通过", "驳回"]
    comment: str = ""


class ApiDefCreate(BaseModel):
    method: Literal["GET", "POST", "PUT", "DELETE", "PATCH"] = "GET"
    path: str = Field(min_length=1)
    name: str = Field(min_length=1)
    module: str = "用户"


class ImportYaml(BaseModel):
    yaml: str = Field(min_length=1)
    module: str = "导入"


class ApiSend(BaseModel):
    method: str = "POST"
    url: str = ""
    body: str = ""
    assertions: list[dict[str, Any]] | int = 0


class SuiteCreate(BaseModel):
    name: str = Field(min_length=1)
    cron: str = "0 2 * * *"
    count: int = 10


class ElementCreate(BaseModel):
    pageId: str
    name: str
    selectorType: Literal["CSS", "XPath", "Text"] = "CSS"
    selectorValue: str


class ScriptCreate(BaseModel):
    name: str
    content: str
    framework: str = "Playwright + POM"


class ScriptUpdate(BaseModel):
    content: str


class RunRequest(BaseModel):
    scriptId: str
    browser: str = "Chromium"


class RecorderStepIn(BaseModel):
    action: str
    target: str
    value: str = ""


class FlowSave(BaseModel):
    nodes: list[dict[str, Any]] = Field(default_factory=list)


class AppRunRequest(BaseModel):
    flow: str
    device: str = "Pixel 7"


class ToolRun(BaseModel):
    params: dict[str, str] = Field(default_factory=dict)


class KbCreate(BaseModel):
    name: str = Field(min_length=1)
    description: str = ""
    embedding: str = "bge-m3"


class RecallRequest(BaseModel):
    query: str
    topK: int = 5
    kbId: str | None = None


class ConversationCreate(BaseModel):
    title: str = "新会话"


class RenameRequest(BaseModel):
    title: str


class ChatConfigModel(BaseModel):
    model: str = "GPT-4o"
    kbIds: list[str] = Field(default_factory=list)
    systemPrompt: str = ""


class ChatSend(BaseModel):
    text: str = Field(min_length=1)


class WorkflowSave(BaseModel):
    name: str = Field(min_length=1)
    nodes: list[dict[str, Any]] = Field(default_factory=list)
    description: str = ""


class WorkflowRunRequest(BaseModel):
    name: str = "未命名工作流"
    nodes: list[dict[str, Any]] = Field(default_factory=list)


class InviteMember(BaseModel):
    name: str = Field(min_length=1)
    email: str = Field(min_length=1)
    dept: str = ""
    role: Literal["管理员", "开发者", "评审者", "只读"] = "开发者"


class RoleUpdate(BaseModel):
    role: Literal["管理员", "开发者", "评审者", "只读"]


class PermissionsUpdate(BaseModel):
    permissions: list[str] = Field(default_factory=list)


class ProfileUpdate(BaseModel):
    name: str | None = None
    email: str | None = None
    phone: str | None = None
    title: str | None = None
    dept: str | None = None
    role: str | None = None
    bio: str | None = None


class PasswordChange(BaseModel):
    oldPassword: str
    newPassword: str


class ApiKeyCreate(BaseModel):
    name: str = Field(min_length=1)


class ProviderCreate(BaseModel):
    name: str = Field(min_length=1)
    models: str = ""
    apiKey: str = ""
    baseUrl: str = ""


class ProviderUpdate(BaseModel):
    name: str | None = None
    models: str | None = None
    apiKey: str | None = None
    baseUrl: str | None = None


class RoutingSave(BaseModel):
    rules: list[dict[str, Any]] = Field(default_factory=list)


class UserCreate(BaseModel):
    email: str = Field(min_length=1)
    role: Literal["管理员", "开发者", "评审者", "只读"] = "开发者"
    dept: str = ""


class ChannelCreate(BaseModel):
    name: str = Field(min_length=1)
    type: str = "飞书 Webhook"
    event: str = "任务失败"
    target: str = ""


class LoginRequest(BaseModel):
    email: str = Field(min_length=1)
    password: str = Field(min_length=1)


class InviteCreate(BaseModel):
    email: str = Field(min_length=1)
    role: Literal["管理员", "开发者", "评审者", "只读"] = "开发者"


class InviteAccept(BaseModel):
    token: str = Field(min_length=1)
    name: str = Field(min_length=1)
    password: str = Field(min_length=8)


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1)
    description: str = ""


class ProjectUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    status: Literal["正常", "已归档"] | None = None


class ProjectMemberAssign(BaseModel):
    userId: str
    role: Literal["管理员", "开发者", "评审者", "只读"] = "开发者"


class SplitChild(BaseModel):
    title: str = Field(min_length=1)
    description: str = ""
    priority: Literal["P0", "P1", "P2"] = "P1"
    points: list[str] = Field(default_factory=list)


class SplitConfirm(BaseModel):
    children: list[SplitChild] = Field(default_factory=list)


class SkillUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    category: str | None = None
    prompt: str | None = None
    params: list[dict[str, Any]] | None = None


class McpServerCreate(BaseModel):
    name: str = Field(min_length=1)
    command: str = Field(min_length=1)
    args: list[str] = Field(default_factory=list)
    env: dict[str, str] = Field(default_factory=dict)
    description: str = ""


class McpServerUpdate(BaseModel):
    name: str | None = None
    command: str | None = None
    args: list[str] | None = None
    env: dict[str, str] | None = None
    description: str | None = None


class RequirementUpdate(BaseModel):
    title: str | None = None
    priority: Literal["P0", "P1", "P2"] | None = None
    status: str | None = None
    owner: str | None = None
    description: str | None = None


class AgentChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    sessionId: str | None = None
    authorization: str | None = Field(default=None, max_length=4096)
