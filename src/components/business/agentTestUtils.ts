import type { Tone } from "@/components/ui";

const RUN_LABEL: Record<string, string> = {
  pending: "待执行",
  running: "执行中",
  pass: "通过",
  fail: "失败",
  needs_review: "待评审",
  error: "异常",
};

const VERDICT_LABEL: Record<string, string> = {
  pass: "通过",
  fail: "失败",
  needs_review: "待评审",
  unavailable: "不可用",
};

const FIX_LABEL: Record<string, string> = {
  open: "待处理",
  in_progress: "修复中",
  fixed: "已修复",
  verified: "已验证",
  closed: "已关闭",
  reopened: "重新打开",
};

const EVALUATOR_LABEL: Record<string, string> = {
  rule: "规则判定",
  llm: "LLM 评审",
  human: "人工评审",
};

export function runTone(status: string): Tone {
  if (status === "pass") return "green";
  if (status === "fail" || status === "error") return "red";
  if (status === "needs_review") return "amber";
  if (status === "running" || status === "pending") return "blue";
  return "gray";
}

export function runLabel(status: string) {
  return RUN_LABEL[status] ?? status;
}

export function verdictTone(verdict: string): Tone {
  if (verdict === "pass") return "green";
  if (verdict === "fail") return "red";
  if (verdict === "needs_review") return "amber";
  return "gray";
}

export function verdictLabel(verdict: string) {
  return VERDICT_LABEL[verdict] ?? verdict;
}

export function fixTone(status: string): Tone {
  if (status === "verified" || status === "closed") return "green";
  if (status === "fixed") return "blue";
  if (status === "in_progress") return "amber";
  if (status === "reopened") return "red";
  return "gray";
}

export function fixLabel(status: string) {
  return FIX_LABEL[status] ?? status;
}

export function evaluatorLabel(type: string) {
  return EVALUATOR_LABEL[type] ?? type;
}

export function fmtTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { hour12: false });
}

export function fmtMs(value?: number | null) {
  return value == null ? "-" : `${Math.round(value)} ms`;
}

export function errorText(error: unknown) {
  return error instanceof Error ? error.message : "操作失败，请稍后重试";
}

export function pretty(value: unknown) {
  if (value == null) return "-";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}
