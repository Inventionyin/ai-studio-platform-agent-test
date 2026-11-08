import { del, get, post, put } from "./http";
import type {
  AgentCase,
  AgentCheckRule,
  AgentConversation,
  AgentConversationDetail,
  AgentDataSummary,
  AgentDocContent,
  AgentDocMeta,
  AgentRun,
  AgentTarget,
  AgentTargetConfig,
  AgentTestSummary,
  EvaluationVerdict,
  EvaluatorType,
  FixRecord,
  RunDetail,
  RunEvaluation,
} from "./types";

export interface AgentTargetInput {
  name: string;
  adapterType: string;
  description?: string;
  config?: AgentTargetConfig;
}

export interface AgentCaseInput {
  name: string;
  targetId?: string;
  inputType: string;
  command: string;
  turns?: string[];
  payload?: Record<string, unknown>;
  expected?: Record<string, unknown>;
  checks?: AgentCheckRule[];
  tags?: string[];
  priority?: string;
}

export interface AgentEvaluateInput {
  evaluatorType: EvaluatorType;
  verdict?: EvaluationVerdict;
  comment?: string;
  score?: number;
}

export interface AgentFixInput {
  runId: string;
  title: string;
  severity?: string;
  category?: string;
  fixTarget?: string;
  symptom?: string;
  rootCause?: string;
  fixAction?: string;
  changedFiles?: string[];
}

export interface AgentRunQuery {
  caseId?: string;
  targetId?: string;
  status?: string;
  sourceType?: string;
  environment?: string;
  conversationId?: string;
}

export interface AgentConversationQuery {
  sourceType?: string;
  environment?: string;
  status?: string;
  q?: string;
  limit?: number;
  offset?: number;
}

function query(params: Record<string, string | number | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

const segment = (value: string) => encodeURIComponent(value);

export const agentTestApi = {
  targets: () => get<AgentTarget[]>("/agent-test/targets"),
  createTarget: (input: AgentTargetInput) => post<AgentTarget>("/agent-test/targets", input),
  updateTarget: (id: string, input: AgentTargetInput) => put<AgentTarget>(`/agent-test/targets/${segment(id)}`, input),
  deleteTarget: (id: string) => del<null>(`/agent-test/targets/${segment(id)}`),
  targetHealth: (id: string) => post<{ ok: boolean; detail: string }>(`/agent-test/targets/${segment(id)}/health`, {}),

  cases: () => get<AgentCase[]>("/agent-test/cases"),
  createCase: (input: AgentCaseInput) => post<AgentCase>("/agent-test/cases", input),
  updateCase: (id: string, input: AgentCaseInput) => put<AgentCase>(`/agent-test/cases/${segment(id)}`, input),
  deleteCase: (id: string) => del<null>(`/agent-test/cases/${segment(id)}`),

  runCase: (input: { caseId: string; targetId?: string }) => post<RunDetail>("/agent-test/runs", input),
  runs: (params: AgentRunQuery = {}) => get<AgentRun[]>(`/agent-test/runs${query({ ...params })}`),
  run: (id: string) => get<RunDetail>(`/agent-test/runs/${segment(id)}`),
  rerun: (id: string) => post<RunDetail>(`/agent-test/runs/${segment(id)}/rerun`, {}),
  evaluate: (id: string, input: AgentEvaluateInput) =>
    post<{ evaluations: RunEvaluation[]; run: AgentRun }>(`/agent-test/runs/${segment(id)}/evaluate`, input),

  fixes: () => get<FixRecord[]>("/agent-test/fixes"),
  createFix: (input: AgentFixInput) => post<FixRecord>("/agent-test/fixes", input),
  updateFix: (id: string, input: AgentFixInput) => put<FixRecord>(`/agent-test/fixes/${segment(id)}`, input),
  regression: (id: string, afterRunId: string) =>
    post<{ fix: FixRecord; before: RunDetail; after: RunDetail; comparison: Record<string, unknown> }>(
      `/agent-test/fixes/${segment(id)}/regression`,
      { afterRunId },
    ),
  generateDoc: (id: string) => post<FixRecord>(`/agent-test/fixes/${segment(id)}/generate-doc`, {}),

  docs: () => get<AgentDocMeta[]>("/agent-test/docs"),
  doc: (name: string) => get<AgentDocContent>(`/agent-test/docs/${segment(name)}`),
  summary: () => get<AgentTestSummary>("/agent-test/summary"),
  dataSummary: () => get<AgentDataSummary>("/agent-test/data-summary"),
  conversations: (params: AgentConversationQuery = {}) =>
    get<{ items: AgentConversation[]; total: number }>(`/agent-test/conversations${query({ ...params })}`),
  conversation: (id: string) => get<AgentConversationDetail>(`/agent-test/conversations/${segment(id)}`),
  labelConversation: (
    id: string,
    input: { verdict: string; score?: number; comment?: string },
  ) => post<{ evaluation: RunEvaluation; runId: string }>(`/agent-test/conversations/${segment(id)}/label`, input),
  conversationToCase: (id: string, input: { name?: string; targetId?: string }) =>
    post<{ caseId: string; name: string }>(`/agent-test/conversations/${segment(id)}/to-case`, input),
};
