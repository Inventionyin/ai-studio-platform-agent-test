import { useState } from "react";
import type { TraceSpan, TraceSpanType } from "@/api/types";
import type { Tone } from "@/components/ui";
import { Empty, Tag } from "@/components/ui";
import { cx } from "@/lib/cx";
import { fmtMs, fmtTime, pretty } from "./agentTestUtils";

const TYPE_META: Record<TraceSpanType, { label: string; border: string; bg: string; tone: Tone }> = {
  command: { label: "command", border: "border-slate-400", bg: "bg-slate-50", tone: "gray" },
  sse: { label: "SSE", border: "border-teal-500", bg: "bg-teal-50/30", tone: "green" },
  agent: { label: "agent", border: "border-blue-500", bg: "bg-blue-50/40", tone: "blue" },
  llm: { label: "LLM", border: "border-violet-500", bg: "bg-violet-50/30", tone: "blue" },
  tool: { label: "工具", border: "border-emerald-500", bg: "bg-emerald-50/30", tone: "green" },
  retrieval: { label: "检索", border: "border-cyan-500", bg: "bg-cyan-50/30", tone: "gray" },
  final: { label: "final", border: "border-indigo-500", bg: "bg-indigo-50/30", tone: "green" },
  judge: { label: "judge", border: "border-amber-500", bg: "bg-amber-50/30", tone: "amber" },
  ui: { label: "ui", border: "border-sky-500", bg: "bg-sky-50/30", tone: "blue" },
  assertion: { label: "断言", border: "border-rose-500", bg: "bg-rose-50/30", tone: "red" },
};

function Payload({ label, value }: { label: string; value: unknown }) {
  return (
    <div>
      <div className="text-[11px] text-slate-500 mb-1">{label}</div>
      <pre className="max-h-56 overflow-auto rounded bg-slate-900 p-2.5 text-[11px] leading-5 text-emerald-300 whitespace-pre-wrap break-words">
        {pretty(value)}
      </pre>
    </div>
  );
}

export function TraceTimeline({ spans }: { spans: TraceSpan[] }) {
  const [expanded, setExpanded] = useState<string[]>([]);
  const sorted = [...spans].sort((a, b) => String(a.startedAt).localeCompare(String(b.startedAt)));
  if (sorted.length === 0) return <Empty text="本次运行没有 Trace span" className="h-40" />;

  const toggle = (id: string) => {
    setExpanded((list) => (list.includes(id) ? list.filter((item) => item !== id) : [...list, id]));
  };

  return (
    <div className="space-y-2">
      {sorted.map((span) => {
        const meta = TYPE_META[span.spanType] ?? { label: span.spanType, border: "border-slate-400", bg: "bg-slate-50", tone: "gray" as Tone };
        const open = expanded.includes(span.id);
        return (
          <div key={span.id} className={cx("border-l-2 rounded-r-md", meta.border, meta.bg)}>
            <button type="button" onClick={() => toggle(span.id)} className="w-full text-left px-3 py-2">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <Tag t={meta.label} c={meta.tone} />
                  <span className="text-xs font-medium text-slate-800 truncate" title={span.name}>{span.name}</span>
                  {span.status === "error" && <Tag t="error" c="red" />}
                  {span.status === "skipped" && <Tag t="skipped" c="gray" />}
                </div>
                <div className="flex items-center gap-2 shrink-0 text-[11px] text-slate-500">
                  <span>{fmtMs(span.latencyMs)}</span>
                  <span>{fmtTime(span.startedAt)}</span>
                  <span className="text-blue-600">{open ? "收起" : "展开"}</span>
                </div>
              </div>
            </button>
            {open && (
              <div className="px-3 pb-3 space-y-2">
                <Payload label="输入" value={span.input} />
                <Payload label="输出" value={span.output} />
                {span.error && (
                  <div>
                    <div className="text-[11px] text-slate-500 mb-1">错误</div>
                    <pre className="rounded border border-rose-100 bg-rose-50 p-2 text-[11px] leading-5 text-rose-700 whitespace-pre-wrap break-words">
                      {span.error}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
