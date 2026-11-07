import type { AgentEvalCase } from "@/api/types";
import { Tag } from "@/components/ui";
import { AgentTraceTimeline } from "./AgentTraceTimeline";

function pass(value: boolean) {
  return value ? "通过" : "失败";
}

function CompareCell({ label, ok, value, expected }: { label: string; ok: boolean; value: string; expected: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50/60 px-3 py-2">
      <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
        <span>{label}</span>
        <Tag t={pass(ok)} c={ok ? "green" : "red"} />
      </div>
      <div className="mt-1 text-xs font-medium text-slate-800 break-words">{value}</div>
      <div className="mt-0.5 text-[11px] text-slate-500">期望：{expected}</div>
    </div>
  );
}

export function AgentCaseDetail({ item }: { item: AgentEvalCase }) {
  const ok = item.intent_ok && item.agent_ok && item.status_ok && item.tool_ok && item.fact_ok;
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-800">{item.case_id}</div>
          <div className="text-xs text-slate-500 mt-0.5">{item.message}</div>
        </div>
        <Tag t={pass(ok)} c={ok ? "green" : "red"} />
      </div>

      <div className="rounded-md border border-blue-100 bg-blue-50/50 px-3 py-2 text-xs text-slate-700">{item.message}</div>

      <div className="grid grid-cols-2 gap-2">
        <CompareCell label="意图" ok={item.intent_ok} value={item.actual_intent} expected={item.expected_intent} />
        <CompareCell label="Agent" ok={item.agent_ok} value={item.actual_agent} expected={item.expected_agent} />
        <CompareCell label="执行状态" ok={item.status_ok} value={item.actual_status} expected={item.expected_status} />
        <CompareCell
          label="工具"
          ok={item.tool_ok}
          value={item.tools.length ? item.tools.join(", ") : "无"}
          expected={item.expected_tool ?? "无"}
        />
      </div>

      <div>
        <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-500">最终回答</div>
        <div className="rounded-md bg-slate-900 px-3 py-2.5 text-xs leading-6 text-slate-100 whitespace-pre-wrap">{item.answer || "（空）"}</div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] text-slate-500">事实校验：</span>
        <Tag t={pass(item.fact_ok)} c={item.fact_ok ? "green" : "red"} />
        {[...(item.answer_facts ?? []), ...(item.answer_any ?? [])].map((fact) => (
          <span key={fact} className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">{fact}</span>
        ))}
        <span className="ml-auto text-[11px] text-slate-500">{item.latency_ms.toFixed(1)} ms</span>
      </div>

      <div>
        <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-slate-500">Trace 时间线</div>
        <AgentTraceTimeline trace={item.trace} />
      </div>
    </div>
  );
}
