import { useState } from "react";
import { projectsApi, teamApi } from "@/api";
import type { Member, Project, RoleName } from "@/api/types";
import { useAsync } from "@/hooks/useAsync";
import { useApp } from "@/store/app";
import { ROLE_OPTIONS } from "@/config/constants";
import { Btn, Card, Field, Modal, Select, Tag } from "@/components/ui";

export function TeamAssignments() {
  const { data, setData } = useAsync(async () => {
    const [projects, members] = await Promise.all([projectsApi.list(), teamApi.members()]);
    return { projects, members };
  }, [], { projects: [] as Project[], members: [] as Member[] });
  const [target, setTarget] = useState<Project | null>(null);
  const [form, setForm] = useState({ userId: "", role: "开发者" as RoleName });
  const { toast } = useApp();

  const openFor = (p: Project) => {
    setTarget(p);
    setForm({ userId: data.members[0]?.id ?? "", role: "开发者" });
  };

  const assign = async () => {
    if (!target || !form.userId) { toast("请选择成员"); return; }
    const updated = await projectsApi.assign(target.id, form.userId, form.role);
    setData({ ...data, projects: data.projects.map((p) => (p.id === updated.id ? updated : p)) });
    setTarget(null);
    toast("项目授权已保存");
  };

  const unassign = async (project: Project, userId: string) => {
    const updated = await projectsApi.unassign(project.id, userId);
    setData({ ...data, projects: data.projects.map((p) => (p.id === updated.id ? updated : p)) });
    toast("已移除项目授权");
  };

  return (
    <>
      <div className="grid grid-cols-3 gap-4">
        {data.projects.map((p) => (
          <Card key={p.id} title={p.name} extra={<Btn v="ghost" onClick={() => openFor(p)}>+ 添加成员</Btn>}>
            <div className="text-xs text-slate-500 mb-3">{p.description}</div>
            <div className="space-y-2">
              {p.members.length === 0 && <div className="h-16 grid place-items-center text-xs text-slate-500">暂无成员</div>}
              {p.members.map((m) => (
                <div key={m.userId} className="flex items-center justify-between text-xs border-b border-slate-100 pb-2 last:border-0">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-slate-200 grid place-items-center text-[10px] text-slate-600">{m.name.slice(0, 1)}</div>
                    <span>{m.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Tag t={m.role} c={m.role === "管理员" ? "blue" : m.role === "评审者" ? "amber" : "gray"} />
                    <Btn v="danger" onClick={() => unassign(p, m.userId)}>移除</Btn>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>

      <Modal open={!!target} title={`项目授权 · ${target?.name ?? ""}`} onClose={() => setTarget(null)} footer={<><Btn v="ghost" onClick={() => setTarget(null)}>取消</Btn><Btn onClick={assign}>保存授权</Btn></>}>
        <div className="space-y-3">
          <Field label="成员">
            <Select opts={data.members.map((m) => `${m.name}（${m.email}）`)} className="w-full" value={data.members.find((m) => m.id === form.userId) ? `${data.members.find((m) => m.id === form.userId)!.name}（${data.members.find((m) => m.id === form.userId)!.email}）` : ""} onChange={(e) => {
              const picked = data.members.find((m) => `${m.name}（${m.email}）` === e.target.value);
              setForm({ ...form, userId: picked?.id ?? "" });
            }} />
          </Field>
          <Field label="项目角色"><Select opts={ROLE_OPTIONS} className="w-full" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as RoleName })} /></Field>
          <div className="text-[11px] text-slate-500">项目角色独立于团队角色，仅作用于当前项目空间。</div>
        </div>
      </Modal>
    </>
  );
}
