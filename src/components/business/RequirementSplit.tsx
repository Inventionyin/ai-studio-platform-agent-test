import { useState } from "react";
import { requirementsApi } from "@/api";
import type { Requirement, SplitChild } from "@/api/types";
import { useApp } from "@/store/app";
import { Btn, Modal, Select, Tag, Textarea } from "@/components/ui";

export function RequirementSplit({ requirement, onUpdated }: { requirement: Requirement; onUpdated: (requirement: Requirement) => void }) {
  const { toast, addTask } = useApp();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [children, setChildren] = useState<SplitChild[]>([]);

  if (requirement.kind === "sub") return null;

  const split = async () => {
    setBusy(true);
    addTask(`需求拆分 · ${requirement.title}`, "生成");
    try {
      const updated = await requirementsApi.split(requirement.id);
      onUpdated(updated);
      const proposal = updated.splitProposal?.children ?? [];
      setChildren(proposal.map((child) => ({ ...child, points: child.points ?? [] })));
      setOpen(true);
      toast(proposal.length ? `AI 提出 ${proposal.length} 个子需求，请确认` : "未返回子需求");
    } catch (err) {
      toast(err instanceof Error ? err.message : "拆分失败");
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (children.length === 0) { toast("请至少保留一个子需求"); return; }
    setBusy(true);
    try {
      await requirementsApi.confirmSplit(requirement.id, children);
      const fresh = await requirementsApi.get(requirement.id);
      onUpdated(fresh);
      setOpen(false);
      toast(`已创建 ${children.length} 个子需求`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "确认失败");
    } finally {
      setBusy(false);
    }
  };

  const openProposal = () => {
    setChildren((requirement.splitProposal?.children ?? []).map((child) => ({ ...child, points: child.points ?? [] })));
    setOpen(true);
  };

  return (
    <>
      <div className="flex items-center gap-2 text-xs flex-wrap">
        <span className="text-slate-500">拆分状态</span>
        <Tag t={requirement.splitStatus || "未拆分"} c={requirement.splitStatus === "已拆分" ? "green" : requirement.splitStatus === "拆分失败" ? "red" : "amber"} />
        {requirement.splitProposal && <Tag t={requirement.splitProposal.mode === "local" ? "本地结构拆分" : "AI 拆分"} c={requirement.splitProposal.mode === "local" ? "amber" : "blue"} />}
        {requirement.splitStatus === "待确认" && (requirement.splitProposal?.children?.length ?? 0) > 0 ? (
          <Btn v="ghost" onClick={openProposal}>查看拆分草案</Btn>
        ) : (
          <Btn v="ghost" onClick={split} disabled={busy}>{busy ? "拆分中…" : "AI 拆分主/子需求"}</Btn>
        )}
      </div>

      <Modal open={open} title="确认子需求" onClose={() => setOpen(false)} width="max-w-3xl" footer={<><Btn v="ghost" onClick={split} disabled={busy}>{busy ? "拆分中…" : "重新拆分"}</Btn><Btn v="ghost" onClick={() => setOpen(false)}>取消</Btn><Btn onClick={confirm} disabled={busy}>确认创建</Btn></>}>
        <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
          {children.map((child, index) => (
            <div key={index} className="border border-slate-200 rounded-md p-3 space-y-2">
              <div className="flex gap-2">
                <input
                  value={child.title}
                  onChange={(e) => setChildren(children.map((item, i) => i === index ? { ...item, title: e.target.value } : item))}
                  className="flex-1 h-8 px-2.5 rounded-md border border-slate-300 text-xs"
                />
                <Select
                  opts={["P0", "P1", "P2"]}
                  value={child.priority}
                  onChange={(e) => setChildren(children.map((item, i) => i === index ? { ...item, priority: e.target.value as SplitChild["priority"] } : item))}
                />
                <Btn v="danger" onClick={() => setChildren(children.filter((_, i) => i !== index))}>移除</Btn>
              </div>
              <textarea
                value={child.description}
                onChange={(e) => setChildren(children.map((item, i) => i === index ? { ...item, description: e.target.value } : item))}
                className="w-full h-16 px-2.5 py-2 rounded-md border border-slate-300 text-xs"
                placeholder="子需求描述"
              />
              <Textarea
                className="w-full h-16"
                value={(child.points ?? []).join("\n")}
                onChange={(e) => setChildren(children.map((item, i) => i === index ? { ...item, points: e.target.value.split("\n") } : item))}
                placeholder="每行一个功能点"
              />
            </div>
          ))}
          {children.length === 0 && <div className="text-xs text-slate-500 text-center py-8">没有子需求，请重新拆分或手动新增。</div>}
          <Btn v="ghost" onClick={() => setChildren([...children, { title: "新子需求", description: "", priority: "P1", points: [] }])}>+ 手动新增</Btn>
        </div>
      </Modal>
    </>
  );
}
