import { useState } from "react";
import { agentTestApi } from "@/api";
import type { AgentCase, AgentTarget } from "@/api/types";
import { useAsync } from "@/hooks/useAsync";
import { useApp } from "@/store/app";
import { Btn, Card, Empty, Table, Tag } from "@/components/ui";
import { AgentCaseModal } from "./AgentCaseModal";
import { AgentTargetModal } from "./AgentTargetModal";
import { errorText, fmtTime } from "./agentTestUtils";

export function AgentTestCasePanel() {
  const { toast } = useApp();
  const { data: targets, loading: targetsLoading, reload: reloadTargets } = useAsync(() => agentTestApi.targets(), [], [] as AgentTarget[]);
  const { data: cases, loading: casesLoading, reload: reloadCases } = useAsync(() => agentTestApi.cases(), [], [] as AgentCase[]);
  const [targetOpen, setTargetOpen] = useState(false);
  const [editingTarget, setEditingTarget] = useState<AgentTarget | null>(null);
  const [checkingId, setCheckingId] = useState<string | null>(null);
  const [caseOpen, setCaseOpen] = useState(false);
  const [editingCase, setEditingCase] = useState<AgentCase | null>(null);

  const targetName = (id: string | null) => targets.find((item) => item.id === id)?.name ?? (id || "-");
  const turnCount = (item: AgentCase) => (item.turns?.length ?? 0);

  const openCreateTarget = () => {
    setEditingTarget(null);
    setTargetOpen(true);
  };

  const openEditTarget = (item: AgentTarget) => {
    setEditingTarget(item);
    setTargetOpen(true);
  };

  const checkTarget = async (target: AgentTarget) => {
    setCheckingId(target.id);
    try {
      const result = await agentTestApi.targetHealth(target.id);
      toast(`${target.name}：${result.ok ? "连接正常" : "连接异常"}${result.detail ? ` · ${result.detail}` : ""}`);
    } catch (error) {
      toast(errorText(error));
    } finally {
      setCheckingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <Card
        title="Agent 目标"
        extra={<Btn onClick={openCreateTarget}>新建目标</Btn>}
      >
        {targetsLoading && targets.length === 0 ? (
          <Empty text="加载目标…" className="h-32" />
        ) : (
          <Table
            cols={["目标", "适配器", "状态", "描述"]}
            rows={targets.map((item) => [
              <span key="name" className="font-medium text-slate-800">{item.name}</span>,
              <Tag key="adapter" t={item.adapterType} c="gray" />,
              <Tag key="status" t={item.status || "启用"} />,
              <span key="desc" className="block max-w-72 truncate text-slate-500" title={item.description}>{item.description || "-"}</span>,
            ])}
            actions={(index) => (
              <>
                <Btn v="ghost" onClick={() => openEditTarget(targets[index])}>编辑</Btn>
                <Btn v="ghost" disabled={checkingId !== null} onClick={() => void checkTarget(targets[index])}>
                  {checkingId === targets[index].id ? "检查中…" : "健康检查"}
                </Btn>
              </>
            )}
            empty="暂无 Agent 目标，请先新建"
          />
        )}
      </Card>

      <Card
        title="测试用例"
        extra={<div className="flex items-center gap-2"><span className="text-[11px] text-slate-500">{cases.length} 条</span><Btn onClick={() => { setEditingCase(null); setCaseOpen(true); }}>新建用例</Btn></div>}
      >
        {casesLoading && cases.length === 0 ? (
          <Empty text="加载用例…" className="h-32" />
        ) : (
          <Table
            cols={["用例", "默认目标", "输入类型", "轮次", "优先级", "状态", "更新时间"]}
            rows={cases.map((item) => [
              <span key="name" className="block max-w-64 truncate font-medium text-slate-800" title={item.name}>{item.name}</span>,
              <span key="target" className="text-slate-600">{targetName(item.targetId)}</span>,
              <Tag key="input" t={item.inputType} c="gray" />,
              turnCount(item) > 0
                ? <Tag key="turns" t={`${turnCount(item)} 轮`} c="blue" />
                : <span key="turns" className="text-slate-400">-</span>,
              <Tag key="priority" t={item.priority} />,
              <Tag key="enabled" t={item.enabled ? "启用" : "停用"} />,
              <span key="time" className="text-slate-500">{fmtTime(item.updatedAt)}</span>,
            ])}
            actions={(index) => <Btn v="ghost" onClick={() => { setEditingCase(cases[index]); setCaseOpen(true); }}>编辑</Btn>}
            empty="暂无测试用例"
          />
        )}
      </Card>

      <AgentTargetModal
        open={targetOpen}
        target={editingTarget}
        onClose={() => { setTargetOpen(false); setEditingTarget(null); }}
        onSaved={() => { setTargetOpen(false); setEditingTarget(null); reloadTargets(); }}
      />

      <AgentCaseModal
        open={caseOpen}
        item={editingCase}
        targets={targets}
        onClose={() => { setCaseOpen(false); setEditingCase(null); }}
        onSaved={() => { setCaseOpen(false); setEditingCase(null); reloadCases(); }}
      />
    </div>
  );
}
