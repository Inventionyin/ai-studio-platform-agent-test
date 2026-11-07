import { useEffect, useState } from "react";
import { agentEvalApi } from "@/api";
import type { AgentEvalRun } from "@/api/types";
import { useAsync } from "@/hooks/useAsync";
import { useApp } from "@/store/app";
import { Btn, Card, Empty, Tag, Table } from "@/components/ui";
import { AgentTraceTimeline } from "./AgentTraceTimeline";

function time(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function shortId(value: string) {
  return value.length > 16 ? `${value.slice(0, 16)}…` : value;
}

export function AgentRunPanel() {
  const { toast } = useApp();
  const { data: runs, reload } = useAsync(() => agentEvalApi.runs(), [], [] as AgentEvalRun[]);
  const [selected, setSelected] = useState<AgentEvalRun | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    if (!selected && runs.length > 0) {
      setSelected(runs[0]);
    }
  }, [runs, selected]);

  const open = async (runId: string) => {
    setLoadingDetail(true);
    try {
      setSelected(await agentEvalApi.run(runId));
    } catch (error) {
      toast(error instanceof Error ? error.message : "加载 run 失败");
    } finally {
      setLoadingDetail(false);
    }
  };

  return (
    <div className="grid grid-cols-5 gap-4 items-start">
      <Card
        title="运行记录"
        className="col-span-3"
        extra={<Btn v="ghost" onClick={reload}>刷新</Btn>}
      >
        <Table
          cols={["时间", "Run ID", "Agent", "意图", "状态", "耗时"]}
          rows={runs.map((run) => [
            <span key="time" className="text-slate-500">{time(run.started_at)}</span>,
            <span key="id" className="font-mono text-[11px] text-blue-700" title={run.run_id}>{shortId(run.run_id)}</span>,
            run.agent,
            <Tag key="intent" t={run.intent} c="gray" />,
            <Tag key="status" t={run.status} c={run.status === "ok" ? "green" : run.status === "need_auth" ? "amber" : "red"} />,
            <span key="latency" className="text-slate-500">{run.latency_ms.toFixed(1)} ms</span>,
          ])}
          onRowClick={(index) => void open(runs[index].run_id)}
          empty="暂无运行记录"
        />
        {runs.length > 0 && (
          <div className="mt-2 text-[11px] text-slate-500">点击行加载完整 trace；运行记录来自 Agent 服务当前存储后端。</div>
        )}
      </Card>

      <Card title="Run 详情" className="col-span-2" extra={loadingDetail ? <span className="text-[11px] text-slate-500">加载中…</span> : undefined}>
        {!selected ? (
          <Empty text="选择一条运行记录" className="h-60" />
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <Tag t={selected.status} c={selected.status === "ok" ? "green" : selected.status === "need_auth" ? "amber" : "red"} />
              <Tag t={selected.agent} c="blue" />
              <span className="text-slate-500">{selected.latency_ms.toFixed(1)} ms</span>
            </div>
            <div className="text-[11px] text-slate-500 font-mono break-all">{selected.run_id}</div>
            <div className="rounded-md border border-blue-100 bg-blue-50/50 px-3 py-2 text-xs text-slate-700">{selected.message}</div>
            <div className="rounded-md bg-slate-900 px-3 py-2.5 text-xs leading-6 text-slate-100 whitespace-pre-wrap">{selected.answer || "（空）"}</div>
            <div className="text-[11px] text-slate-500">
              {selected.llm_calls.length} 次 LLM · {selected.tool_calls.length} 次工具 · {selected.retrievals.length} 次检索
            </div>
            <AgentTraceTimeline trace={selected} />
          </div>
        )}
      </Card>
    </div>
  );
}
