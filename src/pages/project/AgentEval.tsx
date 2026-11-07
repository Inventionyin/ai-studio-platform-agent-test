import { useEffect, useState } from "react";
import { agentEvalApi } from "@/api";
import type { AgentEvalCase, AgentEvalReport, AgentEvalReportMeta, AgentHealth } from "@/api/types";
import { useAsync } from "@/hooks/useAsync";
import { AgentCaseDetail, AgentEvalVerify, AgentRealCall, AgentRunPanel } from "@/components/business";
import { Btn, Card, Empty, Stat, Table, Tag } from "@/components/ui";

const TABS = [
  { key: "report", label: "评测报告" },
  { key: "verify", label: "真实调用验证" },
  { key: "runs", label: "运行记录" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function statusTag(value: string) {
  return <Tag t={value} c={value === "ok" ? "green" : value === "need_auth" || value === "need_confirmation" ? "amber" : "red"} />;
}

export function AgentEval() {
  const [tab, setTab] = useState<TabKey>("report");
  const [reportName, setReportName] = useState("");
  const [selected, setSelected] = useState<AgentEvalCase | null>(null);
  const { data: metas, reload: reloadMetas } = useAsync(() => agentEvalApi.reports(), [], [] as AgentEvalReportMeta[]);
  const { data: health, reload: reloadHealth } = useAsync<AgentHealth | null>(() => agentEvalApi.health(), [], null);
  const { data: report, loading, reload: reloadReport } = useAsync<AgentEvalReport | null>(
    () => (reportName ? agentEvalApi.report(reportName) : Promise.resolve(null)),
    [reportName],
    null,
  );

  useEffect(() => {
    if (metas.length === 0) return;
    if (!metas.some((item) => item.name === reportName && item.exists)) {
      const next = metas.find((item) => item.name === "real" && item.exists) ?? metas.find((item) => item.exists);
      setReportName(next?.name ?? "");
    }
  }, [metas, reportName]);

  useEffect(() => {
    setSelected(report?.results[0] ?? null);
  }, [report]);

  const refresh = () => {
    reloadMetas();
    reloadHealth();
    reloadReport();
  };

  const metrics = report?.metrics;
  const metricCards = [
    ["通过率", metrics ? `${Math.round(metrics.case_pass_rate * 100)}%` : "-"],
    ["意图准确率", metrics ? `${Math.round(metrics.intent_accuracy * 100)}%` : "-"],
    ["Agent 准确率", metrics ? `${Math.round(metrics.agent_accuracy * 100)}%` : "-"],
    ["工具准确率", metrics ? `${Math.round(metrics.tool_accuracy * 100)}%` : "-"],
    ["事实准确率", metrics ? `${Math.round(metrics.answer_fact_accuracy * 100)}%` : "-"],
    ["平均延迟", metrics ? `${Math.round(metrics.avg_latency_ms)} ms` : "-"],
  ];

  return (
    <div className="space-y-4">
      <section className="rounded-lg bg-gradient-to-r from-slate-900 via-slate-800 to-blue-900 p-5 text-white">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-blue-200">Agent Observability</div>
            <h2 className="mt-1 text-lg font-semibold">评测与真实链路验证</h2>
            <p className="mt-1 text-xs text-slate-300">评测报告、真实 Agent 调用、LangGraph trace 与知识检索命中统一查看。</p>
          </div>
          <div className="flex gap-2">
            <Btn v="ghost" onClick={refresh}>刷新数据</Btn>
            <Btn onClick={() => setTab("verify")}>真实链路验证</Btn>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-4 text-[11px] text-slate-300">
          <span className="inline-flex items-center gap-1.5"><span className={`h-1.5 w-1.5 rounded-full ${health?.status === "UP" ? "bg-emerald-400" : "bg-rose-400"}`} />Agent 服务 {health?.status ?? "检查中"}</span>
          <span>LLM {health?.llm ?? "-"}</span>
          <span>RAG {health?.rag ?? "-"}</span>
          <span>trace {health?.trace_store ?? "-"}</span>
          <span className="text-slate-400">真实模型最近一轮 {report?.metrics ? `${Math.round(report.metrics.case_pass_rate * 100)}%` : "-"}</span>
        </div>
      </section>

      <div className="flex items-center justify-between gap-4">
        <div className="flex gap-1 rounded-md border border-slate-200 bg-white p-1">
          {TABS.map((item) => (
            <button
              key={item.key}
              onClick={() => setTab(item.key)}
              className={`rounded px-3 py-1.5 text-xs font-medium ${tab === item.key ? "bg-blue-50 text-blue-700" : "text-slate-500 hover:text-slate-800"}`}
            >
              {item.label}
            </button>
          ))}
        </div>
        {tab === "report" && (
          <div className="flex items-center gap-2 text-[11px] text-slate-500">
            <span>报告</span>
            <div className="flex gap-1 rounded-md bg-slate-100 p-1">
              {metas.map((item) => (
                <button
                  key={item.name}
                  disabled={!item.exists}
                  onClick={() => setReportName(item.name)}
                  className={`rounded px-2.5 py-1 text-[11px] ${reportName === item.name ? "bg-white text-blue-700 shadow-sm" : "text-slate-500"} disabled:opacity-40`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {tab === "report" && (
        <>
          <div className="grid grid-cols-3 xl:grid-cols-6 gap-3">
            {metricCards.map(([label, value]) => <Stat key={label} label={label} value={value} />)}
          </div>

          <div className="grid grid-cols-6 gap-4 items-start">
            <Card title="评测用例" className="col-span-4" extra={<span className="text-[11px] text-slate-500">{report?.results.length ?? 0} 条 · {report?.llm ?? "-"}</span>}>
              {loading && !report ? (
                <Empty text="加载评测报告…" className="h-52" />
              ) : !report ? (
                <Empty text="暂无评测报告" className="h-52" />
              ) : (
                <Table
                  cols={["用例", "用户输入", "意图", "Agent", "状态", "耗时", "结果"]}
                  rows={report.results.map((item) => {
                    const ok = item.intent_ok && item.agent_ok && item.status_ok && item.tool_ok && item.fact_ok;
                    return [
                      <span key="id" className="font-medium text-blue-700">{item.case_id}</span>,
                      <span key="message" className="block max-w-52 truncate text-slate-700" title={item.message}>{item.message}</span>,
                      <Tag key="intent" t={item.actual_intent} c="gray" />,
                      <span key="agent" className="text-[11px]">{item.actual_agent}</span>,
                      statusTag(item.actual_status),
                      <span key="latency" className="text-slate-500">{item.latency_ms.toFixed(1)} ms</span>,
                      <Tag key="result" t={ok ? "通过" : "失败"} c={ok ? "green" : "red"} />,
                    ];
                  })}
                  onRowClick={(index) => setSelected(report.results[index])}
                />
              )}
            </Card>

            <Card title="用例详情" className="col-span-2" extra={<span className="text-[11px] text-slate-500">{selected?.case_id ?? "点击左侧用例"}</span>}>
              {selected ? <AgentCaseDetail item={selected} /> : <Empty text="选择一条用例查看答案与 trace" className="h-52" />}
            </Card>
          </div>
        </>
      )}

      {tab === "verify" && (
        <div className="grid grid-cols-5 gap-4 items-start">
          <div className="col-span-3"><AgentEvalVerify onVerified={(result) => { if (result.passed) reloadHealth(); }} /></div>
          <div className="col-span-2"><AgentRealCall /></div>
        </div>
      )}

      {tab === "runs" && <AgentRunPanel />}
    </div>
  );
}
