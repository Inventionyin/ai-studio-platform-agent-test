import { useEffect, useState } from "react";
import { agentTestApi, type AgentEvaluateInput } from "@/api";
import type { RunDetail } from "@/api/types";
import { useAsync } from "@/hooks/useAsync";
import { useApp } from "@/store/app";
import { Btn, Card, Empty, Tag } from "@/components/ui";
import { AgentConversationCard } from "./AgentConversationCard";
import { AgentVerdictPanel } from "./AgentVerdictPanel";
import { TraceTimeline } from "./TraceTimeline";
import { errorText, fmtMs, fmtTime, pretty, runLabel, runTone } from "./agentTestUtils";

function answerOf(output: RunDetail["run"]["finalOutput"]) {
  if (!output) return "（无最终回答）";
  if (typeof output.answer === "string") return output.answer;
  return pretty(output);
}

export function AgentTraceDetail({ runId }: { runId: string | null }) {
  const { toast } = useApp();
  const { data: detail, setData, loading } = useAsync<RunDetail | null>(
    () => (runId ? agentTestApi.run(runId) : Promise.resolve(null)),
    [runId],
    null,
  );
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    setData(null);
  }, [runId, setData]);

  const evaluate = async (input: AgentEvaluateInput) => {
    if (!detail) return;
    const key = `${input.evaluatorType}-${input.verdict ?? ""}`;
    setBusy(key);
    try {
      const result = await agentTestApi.evaluate(detail.run.id, input);
      setData({ ...detail, run: result.run, evaluations: result.evaluations });
      const label = input.evaluatorType === "rule" ? "规则判定" : input.evaluatorType === "llm" ? "LLM 评审" : "人工评审";
      toast(`${label}已提交`);
    } catch (error) {
      toast(errorText(error));
    } finally {
      setBusy(null);
    }
  };

  if (!runId) return <Empty text="请先在运行控制台选择一次运行" className="h-60" />;
  if (loading && !detail) return <Empty text="加载运行详情…" className="h-60" />;
  if (!detail) return <Empty text="未找到该运行详情" className="h-60" />;

  const { run } = detail;

  return (
    <div className="space-y-4">
      <Card
        title="运行摘要"
        extra={<span className="text-[11px] text-slate-500">{detail.spans.length} spans · {detail.artifacts.length} 产物</span>}
      >
        <div className="flex flex-wrap gap-2 mb-3">
          <Btn v="ghost" disabled={busy !== null} onClick={() => void evaluate({ evaluatorType: "rule" })}>
            {busy === "rule-" ? "判定中…" : "规则判定"}
          </Btn>
          <Btn v="ghost" disabled={busy !== null} onClick={() => void evaluate({ evaluatorType: "llm" })}>
            {busy === "llm-" ? "评审中…" : "LLM 评审"}
          </Btn>
          <Btn disabled={busy !== null} onClick={() => void evaluate({ evaluatorType: "human", verdict: "pass" })}>
            {busy === "human-pass" ? "提交中…" : "人工通过"}
          </Btn>
          <Btn v="danger" disabled={busy !== null} onClick={() => void evaluate({ evaluatorType: "human", verdict: "fail" })}>
            {busy === "human-fail" ? "提交中…" : "人工失败"}
          </Btn>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <div><div className="text-slate-500">Run ID</div><div className="mt-0.5 font-mono text-[11px] text-slate-800 break-all">{run.id}</div></div>
          <div><div className="text-slate-500">状态</div><div className="mt-0.5"><Tag t={runLabel(run.status)} c={runTone(run.status)} /></div></div>
          <div><div className="text-slate-500">用例</div><div className="mt-0.5 font-mono text-[11px] text-slate-800 break-all">{run.caseId || "真实会话"}</div></div>
          <div><div className="text-slate-500">目标</div><div className="mt-0.5 font-mono text-[11px] text-slate-800 break-all">{run.targetId}</div></div>
          <div><div className="text-slate-500">耗时</div><div className="mt-0.5 text-slate-800">{fmtMs(run.latencyMs)}</div></div>
          <div><div className="text-slate-500">Token</div><div className="mt-0.5 text-slate-800">{run.totalTokens ?? "-"}</div></div>
          <div><div className="text-slate-500">开始时间</div><div className="mt-0.5 text-slate-800">{fmtTime(run.startedAt)}</div></div>
          <div><div className="text-slate-500">Trace ID</div><div className="mt-0.5 font-mono text-[11px] text-slate-800 break-all">{run.traceId}</div></div>
        </div>
        {run.error && <div className="mt-3 rounded-md border border-rose-100 bg-rose-50 px-3 py-2 text-[11px] leading-5 text-rose-700">{run.error}</div>}
      </Card>

      {(run.conversation?.length ?? 0) > 0 && <AgentConversationCard turns={run.conversation} />}

      <div className="grid grid-cols-5 gap-4 items-start">
        <Card title="Trace 时间线" className="col-span-3" extra={<span className="text-[11px] text-slate-500">按开始时间排序</span>}>
          <TraceTimeline spans={detail.spans} />
        </Card>
        <div className="col-span-2 space-y-4">
          <Card title="最终回答">
            <div className="max-h-80 overflow-auto whitespace-pre-wrap rounded-md bg-slate-900 px-3 py-2.5 text-xs leading-6 text-slate-100">
              {answerOf(run.finalOutput)}
            </div>
          </Card>
          <AgentVerdictPanel detail={detail} busy={busy !== null} onEvaluate={evaluate} />
        </div>
      </div>
    </div>
  );
}
