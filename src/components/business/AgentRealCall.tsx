import { useState } from "react";
import { agentEvalApi } from "@/api";
import type { AgentChatResult } from "@/api/types";
import { useApp } from "@/store/app";
import { Btn, Card, Input, Modal, Tag, Textarea } from "@/components/ui";
import { AgentTraceTimeline } from "./AgentTraceTimeline";

export function AgentRealCall() {
  const { toast } = useApp();
  const [message, setMessage] = useState("帮我找一顶露营帐篷");
  const [authorization, setAuthorization] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<AgentChatResult | null>(null);
  const [traceOpen, setTraceOpen] = useState(false);

  const submit = async () => {
    if (!message.trim()) return;
    setRunning(true);
    try {
      const value = await agentEvalApi.chat({
        message: message.trim(),
        authorization: authorization.trim() || undefined,
      });
      setResult(value);
      toast("真实调用完成");
    } catch (error) {
      toast(error instanceof Error ? error.message : "调用失败");
    } finally {
      setRunning(false);
    }
  };

  return (
    <Card
      title="自定义真实调用"
      extra={<Btn onClick={() => void submit()} disabled={running}>{running ? "调用中…" : "发起调用"}</Btn>}
    >
      <div className="space-y-3">
        <div>
          <div className="mb-1 text-xs text-slate-600">用户消息</div>
          <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} className="w-full" placeholder="输入要发给 Agent 的消息" />
        </div>
        <div>
          <div className="mb-1 text-xs text-slate-600">登录态（可选，仅用于本次请求，不保存）</div>
          <Input
            value={authorization}
            onChange={(e) => setAuthorization(e.target.value)}
            type="password"
            className="w-full"
            placeholder="Bearer ...，订单类问题需要"
          />
        </div>

        {result && (
          <div className="space-y-2 border-t border-slate-100 pt-3">
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <Tag t={result.response.status} c={result.response.status === "ok" ? "green" : result.response.status === "need_auth" ? "amber" : "red"} />
              <Tag t={result.response.agent} c="blue" />
              <Tag t={result.response.intent} c="gray" />
              <span className="text-slate-500">{result.response.latency_ms.toFixed(1)} ms · {result.response.run_id}</span>
            </div>
            <div className="rounded-md bg-slate-900 px-3 py-2.5 text-xs leading-6 text-slate-100 whitespace-pre-wrap">{result.response.answer}</div>
            <div className="flex items-center justify-between text-[11px] text-slate-500">
              <span>LLM {result.trace.llm_calls.length} 次 · 工具 {result.trace.tool_calls.length} 次 · 检索 {result.trace.retrievals.length} 次</span>
              <Btn v="ghost" onClick={() => setTraceOpen(true)}>查看 Trace</Btn>
            </div>
          </div>
        )}
      </div>

      <Modal open={traceOpen} title={result ? `真实调用 Trace · ${result.response.run_id}` : ""} onClose={() => setTraceOpen(false)} width="max-w-3xl">
        {result && <AgentTraceTimeline trace={result.trace} />}
      </Modal>
    </Card>
  );
}
