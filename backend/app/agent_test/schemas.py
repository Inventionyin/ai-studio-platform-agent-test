"""Pydantic request models for the Agent test API."""
from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

AdapterType = Literal["http", "cli", "mock", "shangpin", "webui", "app"]
InputType = Literal["text", "json", "cli"]
Priority = Literal["P0", "P1", "P2"]


class TargetCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    adapterType: AdapterType = "http"
    description: str = ""
    config: dict[str, Any] = Field(default_factory=dict)
    status: str = "启用"


class TargetUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    adapterType: AdapterType | None = None
    description: str | None = None
    config: dict[str, Any] | None = None
    status: str | None = None


class CaseCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    targetId: str | None = None
    inputType: InputType = "text"
    command: str = ""
    turns: list[str] = Field(default_factory=list)
    payload: dict[str, Any] = Field(default_factory=dict)
    expected: dict[str, Any] = Field(default_factory=dict)
    checks: list[dict[str, Any]] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    priority: Priority = "P1"
    enabled: bool = True
    version: str = "v1.0"


class CaseUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    targetId: str | None = None
    inputType: InputType | None = None
    command: str | None = None
    turns: list[str] | None = None
    payload: dict[str, Any] | None = None
    expected: dict[str, Any] | None = None
    checks: list[dict[str, Any]] | None = None
    tags: list[str] | None = None
    priority: Priority | None = None
    enabled: bool | None = None
    version: str | None = None


class RunCreate(BaseModel):
    caseId: str = Field(min_length=1)
    targetId: str | None = None


class EvaluateRequest(BaseModel):
    evaluatorType: Literal["rule", "llm", "human"]
    verdict: Literal["pass", "fail", "needs_review"] | None = None
    comment: str = ""
    score: float | None = Field(default=None, ge=0, le=1)


class FixCreate(BaseModel):
    runId: str = Field(min_length=1)
    title: str = Field(min_length=1, max_length=200)
    severity: Priority = "P1"
    category: Literal["prompt", "tool", "retrieval", "model", "data", "code", "environment"] = "prompt"
    fixTarget: Literal["agent", "platform", "test_data"] = "agent"
    symptom: str = ""
    rootCause: str = ""
    fixAction: str = ""
    changedFiles: list[str] = Field(default_factory=list)
    aiSuggestion: str = ""
    status: str = "open"


class FixUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    severity: Priority | None = None
    category: Literal["prompt", "tool", "retrieval", "model", "data", "code", "environment"] | None = None
    fixTarget: Literal["agent", "platform", "test_data"] | None = None
    symptom: str | None = None
    rootCause: str | None = None
    fixAction: str | None = None
    changedFiles: list[str] | None = None
    aiSuggestion: str | None = None
    status: str | None = None


class RegressionRequest(BaseModel):
    afterRunId: str = Field(min_length=1)
