import { get, post } from "./http";
import type {
  AgentChatResult,
  AgentEvalReport,
  AgentEvalReportMeta,
  AgentEvalRun,
  AgentHealth,
  AgentVerifyResult,
} from "./types";

export const agentEvalApi = {
  health: () => get<AgentHealth>("/agent-eval/health"),
  reports: () => get<AgentEvalReportMeta[]>("/agent-eval/reports"),
  report: (name: string) => get<AgentEvalReport>(`/agent-eval/reports/${encodeURIComponent(name)}`),
  runs: () => get<AgentEvalRun[]>("/agent-eval/runs"),
  run: (runId: string) => get<AgentEvalRun>(`/agent-eval/runs/${encodeURIComponent(runId)}`),
  verify: () => post<AgentVerifyResult>("/agent-eval/verify", {}),
  chat: (input: { message: string; sessionId?: string; authorization?: string }) =>
    post<AgentChatResult>("/agent-eval/chat", input),
};
