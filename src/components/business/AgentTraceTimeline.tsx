import type { AgentEvalTrace } from "@/api/types";
import { Empty, Tag } from "@/components/ui";

function ms(value: number | null | undefined) {
  return value == null ? "-" : `${Number(value).toFixed(1)} ms`;
}

function time(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN", { hour12: false });
}

type TraceEvent = {
  at: string;
  kind: "LLM" | "工具" | "检索";
  title: string;
  meta: string;
  payload: unknown;
};

function buildEvents(trace: AgentEvalTrace): TraceEvent[] {
  const events: TraceEvent[] = [];
  for (const call of trace.llm_calls ?? []) {
    events.push({
      at: call.at,
      kind: "LLM",
      title: `LLM · ${call.node}`,
      meta: `${call.model} · ${call.input_tokens ?? "-"} in / ${call.output_tokens ?? "-"} out · ${ms(call.latency_ms)}`,
      payload: { prompt: call.prompt, response: call.response },
    });
  }
  for (const call of trace.tool_calls ?? []) {
    events.push({
      at: call.at,
      kind: "工具",
      title: `工具 · ${call.name}`,
      meta: `${call.status} · ${ms(call.latency_ms)}`,
      payload: { args: call.args, result: call.result },
    });
  }
  for (const item of trace.retrievals ?? []) {
    events.push({
      at: item.at,
      kind: "检索",
      title: `检索 · ${item.backend}`,
      meta: `${item.hits.length} hits${item.fallback ? " · fallback" : ""}`,
      payload: { query: item.query, hits: item.hits, error: item.error },
    });
  }
  return events.sort((a, b) => a.at.localeCompare(b.at));
}

export function AgentTraceTimeline({ trace }: { trace?: AgentEvalTrace | null }) {
  if (!trace) return <Empty text="没有 trace 数据" className="h-32" />;
  const events = buildEvents(trace);
  if (events.length === 0) return <Empty text="本次运行没有 LLM/工具/检索事件" className="h-32" />;
  return (
    <div className="space-y-2">
      {events.map((event, index) => (
        <div
          key={`${event.kind}-${index}`}
          className={
            event.kind === "LLM"
              ? "border-l-2 border-blue-500 bg-blue-50/40 rounded-r-md px-3 py-2"
              : event.kind === "工具"
                ? "border-l-2 border-emerald-500 bg-emerald-50/30 rounded-r-md px-3 py-2"
                : "border-l-2 border-violet-500 bg-violet-50/30 rounded-r-md px-3 py-2"
          }
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <Tag t={event.kind} c={event.kind === "LLM" ? "blue" : event.kind === "工具" ? "green" : "gray"} />
              <span className="text-xs font-medium text-slate-800 truncate">{event.title}</span>
            </div>
            <span className="text-[11px] text-slate-500 shrink-0">{event.meta}</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1">{time(event.at)}</div>
          <details className="mt-2">
            <summary className="text-[11px] text-blue-600 cursor-pointer select-none">查看入参 / 出参</summary>
            <pre className="mt-2 max-h-56 overflow-auto rounded bg-slate-900 p-2.5 text-[11px] leading-5 text-emerald-300 whitespace-pre-wrap break-words">
              {JSON.stringify(event.payload, null, 2)}
            </pre>
          </details>
        </div>
      ))}
    </div>
  );
}
