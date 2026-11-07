import { useState } from "react";
import { agentEvalApi } from "@/api";
import type { AgentVerifyProbe, AgentVerifyResult } from "@/api/types";
import { useApp } from "@/store/app";
import { Btn, Card, Modal, Tag } from "@/components/ui";
import { AgentTraceTimeline } from "./AgentTraceTimeline";

function StateTag({ value }: { value: string }) {
  return <Tag t={value} c={value === "ok" || value === "通过" ? "green" : value === "need_auth" ? "amber" : "red"} />;
}

export function AgentEvalVerify({ onVerified }: { onVerified?: (result: AgentVerifyResult) => void }) {
  const { toast } = useApp();
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<AgentVerifyResult | null>(null);
  const [traceProbe, setTraceProbe] = useState<AgentVerifyProbe | null>(null);

  const run = async () => {
    setRunning(true);
    try {
      const value = await agentEvalApi.verify();
      setResult(value);
      onVerified?.(value);
      toast(value.passed ? "真实链路验证通过" : "真实链路验证存在失败项");
    } catch (error) {
      toast(error instanceof Error ? error.message : "验证失败");
    } finally {
      setRunning(false);
    }
  };

  return (
    <Card
      title="真实链路验证"
      extra={
        <Btn onClick={() => void run()} disabled={running}>
          {running ? "验证中…" : result ? "重新验证" : "运行验证"}
        </Btn>
      }
    >
      <div className="space-y-3">
        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-600">
          从 AI_Studio 后端真实调用 Agent 服务，依次验证商品工具、知识库 RAG、订单鉴权边界，并检查每次运行的 LLM / 工具 / 检索 trace。
        </div>

        {!result && !running && (
          <div className="grid grid-cols-3 gap-2">
            {[
              ["商品搜索", "ShoppingGuideAgent · searchProducts"],
              ["知识库 RAG", "KnowledgeAgent · pgvector 检索"],
              ["订单鉴权", "OrderAgent · 未登录返回 need_auth"],
            ].map(([title, desc]) => (
              <div key={title} className="rounded-md border border-slate-200 p-3">
                <div className="text-xs font-medium text-slate-800">{title}</div>
                <div className="mt-1 text-[11px] text-slate-500 leading-5">{desc}</div>
              </div>
            ))}
          </div>
        )}

        {running && (
          <div className="rounded-md border border-blue-100 bg-blue-50 px-3 py-3 text-xs text-blue-700">
            正在发起 3 条真实调用并拉取 trace，预计 10 秒左右…
          </div>
        )}

        {result && (
          <>
            <div className={`flex items-center justify-between rounded-md px-3 py-2.5 text-xs ${result.passed ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
              <span className="font-medium">{result.passed ? "3 条真实链路全部通过" : "存在失败项，请查看探针详情"}</span>
              <span>{result.probes.filter((item) => item.passed).length} / {result.probes.length} 通过</span>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
              <Tag t={result.health.llm} c="blue" />
              <Tag t={`RAG ${result.health.rag}`} c={result.health.rag === "pgvector" ? "green" : "gray"} />
              <Tag t={`trace ${result.health.trace_store}`} c={result.health.trace_store === "postgres" ? "green" : "gray"} />
              <span>Agent 服务 {result.health.status}</span>
            </div>
            <div className="space-y-2">
              {result.probes.map((probe) => (
                <div key={probe.key} className="rounded-md border border-slate-200 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Tag t={probe.passed ? "通过" : "失败"} c={probe.passed ? "green" : "red"} />
                      <span className="text-xs font-medium text-slate-800">{probe.label}</span>
                      <StateTag value={probe.status} />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-slate-500">{probe.latencyMs} ms</span>
                      <Btn v="ghost" onClick={() => setTraceProbe(probe)}>查看 Trace</Btn>
                    </div>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
                    {probe.checks.map((check) => (
                      <div key={check.label} className="flex items-center gap-1.5 text-[11px]">
                        <span className={check.passed ? "text-emerald-600" : "text-rose-600"}>{check.passed ? "通过" : "失败"}</span>
                        <span className="text-slate-600">{check.label}</span>
                        <span className="text-slate-500 truncate">{check.detail}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <Modal open={!!traceProbe} title={traceProbe ? `真实调用 Trace · ${traceProbe.label}` : ""} onClose={() => setTraceProbe(null)} width="max-w-3xl">
        {traceProbe && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs text-slate-600">
              <Tag t={traceProbe.passed ? "通过" : "失败"} c={traceProbe.passed ? "green" : "red"} />
              <span>{traceProbe.agent}</span>
              <span>·</span>
              <span>{traceProbe.traceSummary.llmCalls} 次 LLM / {traceProbe.traceSummary.toolCalls} 次工具 / {traceProbe.traceSummary.retrievals} 次检索</span>
            </div>
            <div className="rounded-md bg-slate-900 px-3 py-2.5 text-xs leading-6 text-slate-100 whitespace-pre-wrap">{traceProbe.answer}</div>
            <AgentTraceTimeline trace={traceProbe.trace} />
          </div>
        )}
      </Modal>
    </Card>
  );
}
