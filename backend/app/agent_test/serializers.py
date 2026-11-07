"""camelCase serializers for Agent trace ORM objects."""
from __future__ import annotations

from datetime import datetime
from typing import Any

from ..models import AgentRun, AgentTarget, AgentTestCase, FixRecord, RunEvaluation, TraceArtifact, TraceSpan


def iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def target_public(item: AgentTarget) -> dict[str, Any]:
    return {
        "id": item.id,
        "projectId": item.project_id,
        "name": item.name,
        "adapterType": item.adapter_type,
        "description": item.description,
        "config": item.config or {},
        "status": item.status,
        "createdBy": item.created_by,
        "createdAt": iso(item.created_at),
        "updatedAt": iso(item.updated_at),
    }


def case_public(item: AgentTestCase) -> dict[str, Any]:
    return {
        "id": item.id,
        "projectId": item.project_id,
        "targetId": item.target_id,
        "name": item.name,
        "inputType": item.input_type,
        "command": item.command,
        "turns": item.turns or [],
        "payload": item.payload or {},
        "expected": item.expected or {},
        "checks": item.checks or [],
        "tags": item.tags or [],
        "priority": item.priority,
        "enabled": item.enabled,
        "version": item.version,
        "createdBy": item.created_by,
        "createdAt": iso(item.created_at),
        "updatedAt": iso(item.updated_at),
    }


def run_public(item: AgentRun) -> dict[str, Any]:
    return {
        "id": item.id,
        "projectId": item.project_id,
        "targetId": item.target_id,
        "caseId": item.case_id,
        "traceId": item.trace_id,
        "status": item.status,
        "input": item.input or {},
        "finalOutput": item.final_output or {},
        "conversation": item.conversation or [],
        "verdict": item.verdict or {},
        "error": item.error,
        "latencyMs": item.latency_ms,
        "totalTokens": item.total_tokens,
        "startedAt": iso(item.started_at),
        "finishedAt": iso(item.finished_at),
        "triggeredBy": item.triggered_by,
        "createdAt": iso(item.created_at),
    }


def span_public(item: TraceSpan) -> dict[str, Any]:
    return {
        "id": item.id,
        "traceId": item.trace_id,
        "runId": item.run_id,
        "parentSpanId": item.parent_span_id,
        "spanType": item.span_type,
        "name": item.name,
        "status": item.status,
        "input": item.input or {},
        "output": item.output or {},
        "error": item.error,
        "startedAt": iso(item.started_at),
        "endedAt": iso(item.ended_at),
        "latencyMs": item.latency_ms,
        "attributes": item.attributes or {},
    }


def artifact_public(item: TraceArtifact) -> dict[str, Any]:
    return {
        "id": item.id,
        "traceId": item.trace_id,
        "runId": item.run_id,
        "spanId": item.span_id,
        "artifactType": item.artifact_type,
        "name": item.name,
        "path": item.path,
        "mime": item.mime,
        "size": item.size,
        "createdAt": iso(item.created_at),
    }


def evaluation_public(item: RunEvaluation) -> dict[str, Any]:
    return {
        "id": item.id,
        "runId": item.run_id,
        "evaluatorType": item.evaluator_type,
        "verdict": item.verdict,
        "score": item.score,
        "checks": item.checks or [],
        "comment": item.comment,
        "model": item.model,
        "prompt": item.prompt,
        "response": item.response,
        "createdBy": item.created_by,
        "createdAt": iso(item.created_at),
    }


def fix_public(item: FixRecord) -> dict[str, Any]:
    return {
        "id": item.id,
        "projectId": item.project_id,
        "runId": item.run_id,
        "caseId": item.case_id,
        "targetId": item.target_id,
        "title": item.title,
        "slug": item.slug,
        "severity": item.severity,
        "category": item.category,
        "fixTarget": item.fix_target,
        "symptom": item.symptom,
        "rootCause": item.root_cause,
        "fixAction": item.fix_action,
        "changedFiles": item.changed_files or [],
        "beforeRunId": item.before_run_id,
        "afterRunId": item.after_run_id,
        "status": item.status,
        "docPath": item.doc_path,
        "aiSuggestion": item.ai_suggestion,
        "createdBy": item.created_by,
        "createdAt": iso(item.created_at),
        "updatedAt": iso(item.updated_at),
    }
