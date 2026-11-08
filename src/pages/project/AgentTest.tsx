import { useState } from "react";
import { agentTestApi } from "@/api";
import type { AgentTestSummary } from "@/api/types";
import { useAsync } from "@/hooks/useAsync";
import { AgentDocPanel } from "@/components/business/AgentDocPanel";
import { AgentFixPanel } from "@/components/business/AgentFixPanel";
import { AgentRealDataPanel } from "@/components/business/AgentRealDataPanel";
import { AgentRunPanelV2 } from "@/components/business/AgentRunPanelV2";
import { AgentTestCasePanel } from "@/components/business/AgentTestCasePanel";
import { AgentTraceDetail } from "@/components/business/AgentTraceDetail";
import { Stat } from "@/components/ui";
import { cx } from "@/lib/cx";

const TABS = [
  { key: "cases", label: "测试用例" },
  { key: "runs", label: "运行控制台" },
  { key: "trace", label: "Trace 详情" },
  { key: "fixes", label: "修复工作台" },
  { key: "docs", label: "经验文档" },
] as const;

type TabKey = (typeof TABS)[number]["key"];
type ScopeKey = "test" | "real";

export function AgentTest() {
  const [scope, setScope] = useState<ScopeKey>("test");
  const [tab, setTab] = useState<TabKey>("cases");
  const [runId, setRunId] = useState<string | null>(null);
  const { data: summary } = useAsync<AgentTestSummary | null>(() => agentTestApi.summary(), [], null);

  const stats: [string, string | number][] = [
    ["Agent 目标", summary?.targets ?? "-"],
    ["测试用例", summary?.cases ?? "-"],
    ["运行次数", summary?.runs ?? "-"],
    ["通过率", summary ? `${Math.round(summary.passRate <= 1 ? summary.passRate * 100 : summary.passRate)}%` : "-"],
    ["失败 / 待评审", summary ? `${summary.failCount} / ${summary.needsReviewCount}` : "-"],
    ["修复工单", summary?.fixes ?? "-"],
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex gap-1 rounded-md border border-slate-200 bg-white p-1">
          {([
            ["test", "测试数据"],
            ["real", "真实数据"],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setScope(key)}
              className={cx(
                "rounded px-4 py-1.5 text-xs font-medium",
                scope === key ? "bg-blue-600 text-white" : "text-slate-500 hover:text-slate-800",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="text-[11px] text-slate-500">
          {scope === "test" ? "AI 自动执行 Golden / 回归用例" : "人工体验与生产真实会话"}
        </span>
      </div>

      {scope === "real" ? (
        <AgentRealDataPanel />
      ) : (
        <>
          <div className="flex items-center justify-between gap-4">
            <div className="flex gap-1 rounded-md border border-slate-200 bg-white p-1">
              {TABS.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setTab(item.key)}
                  className={cx(
                    "rounded px-3 py-1.5 text-xs font-medium",
                    tab === item.key ? "bg-blue-50 text-blue-700" : "text-slate-500 hover:text-slate-800",
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <span className="text-[11px] text-slate-500">{runId ? `当前运行：${runId}` : "未选择运行"}</span>
          </div>

          <div className="grid grid-cols-3 xl:grid-cols-6 gap-3">
            {stats.map(([label, value]) => <Stat key={label} label={label} value={value} />)}
          </div>

          <div className="rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-700">
            测试数据由 AI 自动执行：当前数据集 golden-200 v3.2.1（200 条，20 条 LLM Judge），
            另含早期 Golden 20 条；通过率与 Judge 只统计测试运行，不混入真实会话。
          </div>

          {tab === "cases" && <AgentTestCasePanel />}
          {tab === "runs" && (
            <AgentRunPanelV2
              selectedRunId={runId}
              onSelectRun={setRunId}
              onOpenTrace={() => setTab("trace")}
            />
          )}
          {tab === "trace" && <AgentTraceDetail runId={runId} />}
          {tab === "fixes" && <AgentFixPanel selectedRunId={runId} />}
          {tab === "docs" && <AgentDocPanel />}
        </>
      )}
    </div>
  );
}
