import { useState } from "react";
import { agentTestApi } from "@/api";
import type { AgentConversation, AgentConversationDetail } from "@/api/types";
import { useAsync } from "@/hooks/useAsync";
import { useApp } from "@/store/app";
import { Btn, Card, Drawer, Empty, Input, Select, Stat, Table, Tag } from "@/components/ui";
import { errorText, fmtTime } from "./agentTestUtils";

const SOURCE_OPTIONS = ["全部来源", "人工测试", "生产"];

function sourceLabel(value: string): string {
  return value === "human_manual" ? "人工测试" : value === "production" ? "生产" : value;
}

function sourceTone(value: string): "blue" | "green" | "gray" {
  return value === "production" ? "green" : value === "human_manual" ? "blue" : "gray";
}

function statusTone(value: string): "green" | "red" | "amber" | "gray" {
  if (value === "AI_ONGOING" || value === "OK") return "green";
  if (value === "HANDOFF" || value === "FAILED") return "red";
  if (value === "QUEUED" || value === "HUMAN_ONGOING") return "amber";
  return "gray";
}

export function AgentRealDataPanel() {
  const { toast } = useApp();
  const [source, setSource] = useState("全部来源");
  const [q, setQ] = useState("");
  const [detail, setDetail] = useState<AgentConversationDetail | null>(null);
  const [busy, setBusy] = useState("");

  const { data: counts } = useAsync(
    () => agentTestApi.dataSummary(),
    [],
    { testRuns: 0, manualConversations: 0, productionConversations: 0, failedTestRuns: 0 },
  );

  const { data, loading, reload } = useAsync(
    () => agentTestApi.conversations({
      sourceType: source === "全部来源" ? undefined : source === "人工测试" ? "human_manual" : "production",
      q: q.trim() || undefined,
      limit: 100,
    }),
    [source, q],
    { items: [] as AgentConversation[], total: 0 },
  );

  const openDetail = async (id: string) => {
    try {
      setDetail(await agentTestApi.conversation(id));
    } catch (error) {
      toast(errorText(error));
    }
  };

  const label = async (verdict: "pass" | "fail" | "needs_review") => {
    if (!detail) return;
    setBusy(verdict);
    try {
      await agentTestApi.labelConversation(detail.conversation.id, { verdict });
      toast("已记录人工判定");
      setDetail(await agentTestApi.conversation(detail.conversation.id));
      reload();
    } catch (error) {
      toast(errorText(error));
    } finally {
      setBusy("");
    }
  };

  const toCase = async () => {
    if (!detail) return;
    setBusy("case");
    try {
      const result = await agentTestApi.conversationToCase(detail.conversation.id, {});
      toast(`已生成测试用例：${result.name}`);
    } catch (error) {
      toast(errorText(error));
    } finally {
      setBusy("");
    }
  };

  const items = data.items;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-3">
        <Stat label="真实会话" value={counts.manualConversations + counts.productionConversations} />
        <Stat label="人工测试" value={counts.manualConversations} />
        <Stat label="生产会话" value={counts.productionConversations} />
        <Stat label="测试运行" value={counts.testRuns} />
      </div>

      <Card
        title="真实数据"
        extra={
          <div className="flex items-center gap-2">
            <Select value={source} onChange={(e) => setSource(e.target.value)} opts={SOURCE_OPTIONS} />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="搜索会话 ID / 客户标识"
              className="w-56"
            />
            <Btn v="ghost" onClick={reload}>刷新</Btn>
          </div>
        }
      >
        {loading && items.length === 0 ? (
          <Empty text="加载真实会话…" className="h-32" />
        ) : (
          <Table
            cols={["时间", "来源", "渠道", "会话 ID", "消息数", "状态"]}
            rows={items.map((item) => [
              <span key="time" className="text-slate-500">{fmtTime(item.startedAt || item.createdAt)}</span>,
              <Tag key="source" t={sourceLabel(item.sourceType)} c={sourceTone(item.sourceType)} />,
              <span key="channel" className="text-slate-600">{item.channel || "-"}</span>,
              <span key="id" className="font-mono text-[11px] text-blue-700">{item.externalSessionId || item.id}</span>,
              <span key="count" className="text-slate-600">{item.messageCount}</span>,
              <Tag key="status" t={item.status || "未知"} c={statusTone(item.status)} />,
            ])}
            actions={(index) => <Btn v="ghost" onClick={() => void openDetail(items[index].id)}>查看</Btn>}
            empty="暂无真实数据；生产会话接入 webhook 或人工体验后在这里出现"
          />
        )}
      </Card>

      <Drawer open={!!detail} title="真实会话详情" onClose={() => setDetail(null)} width="w-[720px]">
        {detail && (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3 rounded-md bg-slate-50 p-3 text-xs">
              <div>来源：{sourceLabel(detail.conversation.sourceType)}</div>
              <div>渠道：{detail.conversation.channel || "-"}</div>
              <div>会话：{detail.conversation.externalSessionId || detail.conversation.id}</div>
              <div>消息数：{detail.conversation.messageCount}</div>
              <div>开始：{fmtTime(detail.conversation.startedAt)}</div>
              <div>状态：{detail.conversation.status || "-"}</div>
            </div>

            <div className="flex gap-2">
              <Btn v="ghost" disabled={!!busy} onClick={() => void label("pass")}>判为通过</Btn>
              <Btn v="ghost" disabled={!!busy} onClick={() => void label("fail")}>判为失败</Btn>
              <Btn v="ghost" disabled={!!busy} onClick={() => void label("needs_review")}>待评审</Btn>
              <Btn disabled={!!busy} onClick={() => void toCase()}>转为测试用例</Btn>
            </div>

            {detail.runs.map((item) => {
              const turn = item.run.conversation?.[0];
              return (
                <Card key={item.run.id} title={`Run ${item.run.id}`}>
                  <div className="space-y-2 text-xs">
                    <div><span className="text-slate-500">用户：</span>{String(turn?.input || item.run.input?.command || "-")}</div>
                    <div><span className="text-slate-500">回答：</span>{String(turn?.answer || item.run.finalOutput?.answer || "-")}</div>
                    <div className="flex gap-2">
                      <Tag t={item.run.status} c={item.run.status === "observed" ? "blue" : "gray"} />
                      <Tag t={`${item.spans.length} spans`} c="gray" />
                      {item.run.latencyMs != null && <Tag t={`${item.run.latencyMs} ms`} c="gray" />}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </Drawer>
    </div>
  );
}
