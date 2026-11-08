import { useEffect, useState } from "react";
import { agentTestApi } from "@/api";
import type { AgentCase, AgentRun } from "@/api/types";
import { useAsync } from "@/hooks/useAsync";
import { useApp } from "@/store/app";
import { Btn, Card, Empty, Table, Tag } from "@/components/ui";
import { errorText, fmtMs, fmtTime, runLabel, runTone, verdictLabel, verdictTone } from "./agentTestUtils";

function verdictOf(run: AgentRun) {
  const value = run.verdict?.verdict;
  return typeof value === "string" ? value : run.status;
}

export function AgentRunPanelV2({ selectedRunId, onSelectRun, onOpenTrace }: {
  selectedRunId: string | null;
  onSelectRun: (runId: string) => void;
  onOpenTrace: () => void;
}) {
  const { toast } = useApp();
  const { data: cases } = useAsync(() => agentTestApi.cases(), [], [] as AgentCase[]);
  const { data: runs, loading, reload } = useAsync(
    () => agentTestApi.runs({ sourceType: "ai_test" }),
    [],
    [] as AgentRun[],
  );
  const [caseId, setCaseId] = useState("");
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (cases.length === 0) return;
    if (!cases.some((item) => item.id === caseId)) setCaseId(cases[0].id);
  }, [cases, caseId]);

  const caseName = (id: string | null) => id ? cases.find((item) => item.id === id)?.name ?? id : "真实会话";

  const runCase = async () => {
    if (!caseId) {
      toast("请先选择用例");
      return;
    }
    setRunning(true);
    try {
      const detail = await agentTestApi.runCase({ caseId });
      onSelectRun(detail.run.id);
      reload();
      toast(`运行完成：${runLabel(detail.run.status)}`);
    } catch (error) {
      toast(errorText(error));
    } finally {
      setRunning(false);
    }
  };

  return (
    <Card
      title="运行控制台"
      extra={<Btn v="ghost" onClick={reload} disabled={loading}>{loading ? "刷新中…" : "刷新"}</Btn>}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-500">选择用例</span>
        <select
          className="h-8 px-2 rounded-md border border-slate-300 text-xs bg-white min-w-64"
          value={caseId}
          onChange={(e) => setCaseId(e.target.value)}
        >
          <option value="">请选择用例</option>
          {cases.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        <Btn onClick={() => void runCase()} disabled={running || !caseId}>{running ? "运行中…" : "运行用例"}</Btn>
        <div className="flex-1" />
        {selectedRunId && <span className="text-[11px] text-slate-500">已选运行 <span className="font-mono text-blue-700">{selectedRunId}</span></span>}
      </div>

      <div className="mt-3">
        {loading && runs.length === 0 ? (
          <Empty text="加载运行记录…" className="h-32" />
        ) : (
          <Table
            cols={["时间", "Run ID", "用例", "状态", "轮次", "耗时", "判定"]}
            rows={runs.map((run) => [
              <span key="time" className="text-slate-500">{fmtTime(run.startedAt)}</span>,
              <span key="id" className="inline-flex items-center gap-1.5 font-mono text-[11px] text-blue-700">
                <span title={run.id}>{run.id.length > 16 ? `${run.id.slice(0, 16)}…` : run.id}</span>
                {run.id === selectedRunId && <Tag t="当前" c="blue" />}
              </span>,
              <span key="case" className="block max-w-52 truncate" title={caseName(run.caseId)}>{caseName(run.caseId)}</span>,
              <Tag key="status" t={runLabel(run.status)} c={runTone(run.status)} />,
              (run.conversation?.length ?? 0) > 0
                ? <Tag key="turns" t={`${run.conversation.length} 轮`} c="blue" />
                : <span key="turns" className="text-slate-400">-</span>,
              <span key="latency" className="text-slate-500">{fmtMs(run.latencyMs)}</span>,
              <Tag key="verdict" t={verdictLabel(verdictOf(run))} c={verdictTone(verdictOf(run))} />,
            ])}
            actions={(index) => (
              <Btn v="ghost" onClick={() => { onSelectRun(runs[index].id); onOpenTrace(); }}>查看 Trace</Btn>
            )}
            onRowClick={(index) => onSelectRun(runs[index].id)}
            empty="暂无运行记录，请选择用例后运行"
          />
        )}
      </div>
      <div className="mt-2 text-[11px] text-slate-500">点击运行记录可将其设为当前运行，Trace 详情与修复工作台会使用该运行。</div>
    </Card>
  );
}
