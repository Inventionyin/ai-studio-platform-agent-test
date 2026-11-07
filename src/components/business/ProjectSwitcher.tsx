import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { projectsApi } from "@/api";
import { useApp } from "@/store/app";
import { layerOf } from "@/config/menu";
import { Btn, Field, Input, Modal, Textarea } from "@/components/ui";

export function ProjectSwitcher() {
  const { projects, projectId, projectRole, isAdmin, setProjectId, refreshProjects, toast } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ name: "", description: "" });
  const [busy, setBusy] = useState(false);

  const current = projects.find((item) => item.id === projectId);
  const canEdit = isAdmin || projectRole === "管理员";

  const openEdit = () => {
    if (!current) return;
    setForm({ name: current.name, description: current.description });
    setOpen(true);
  };

  const save = async () => {
    if (!current || !form.name.trim()) return;
    setBusy(true);
    try {
      await projectsApi.update(current.id, { name: form.name.trim(), description: form.description });
      await refreshProjects();
      setOpen(false);
      toast("项目已更新");
    } catch (err) {
      toast(err instanceof Error ? err.message : "更新失败");
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    if (!form.name.trim()) return;
    setBusy(true);
    try {
      const project = await projectsApi.create(form.name.trim(), form.description);
      await refreshProjects();
      setProjectId(project.id);
      setCreateOpen(false);
      setForm({ name: "", description: "" });
      navigate(`/project/${project.id}/overview`);
      toast("项目已创建");
    } catch (err) {
      toast(err instanceof Error ? err.message : "创建失败");
    } finally {
      setBusy(false);
    }
  };

  const archive = async () => {
    if (!current) return;
    if (!window.confirm(`确定归档「${current.name}」？归档后项目不再出现在列表中。`)) return;
    setBusy(true);
    try {
      await projectsApi.archive(current.id);
      await refreshProjects();
      setOpen(false);
      navigate("/dashboard");
      toast("项目已归档");
    } catch (err) {
      toast(err instanceof Error ? err.message : "归档失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <label className="flex items-center gap-2 text-xs">
        项目
        <select
          value={projectId}
          onChange={(e) => {
            const next = e.target.value;
            if (!projects.some((p) => p.id === next)) return;
            setProjectId(next);
            if (layerOf(location.pathname) === "project") navigate(`/project/${next}/overview`);
          }}
          className="bg-slate-800 border border-slate-700 rounded h-7 px-2 text-slate-100 max-w-40"
        >
          {projects.length === 0 && <option value="">暂无项目</option>}
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>
      {canEdit && current && <button onClick={openEdit} className="text-xs text-slate-300 hover:text-white">编辑</button>}
      {isAdmin && <button onClick={() => { setForm({ name: "", description: "" }); setCreateOpen(true); }} className="text-xs text-slate-300 hover:text-white">+ 新建</button>}

      <Modal open={open} title="编辑项目" onClose={() => setOpen(false)} footer={<><Btn v="ghost" onClick={() => setOpen(false)}>取消</Btn><Btn onClick={save} disabled={busy}>保存</Btn></>}>
        <div className="space-y-3">
          <Field label="项目名称"><Input className="w-full" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="项目描述"><Textarea className="w-full h-24" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
          {isAdmin && <Btn v="danger" onClick={archive} disabled={busy}>归档项目</Btn>}
        </div>
      </Modal>

      <Modal open={createOpen} title="新建项目" onClose={() => setCreateOpen(false)} footer={<><Btn v="ghost" onClick={() => setCreateOpen(false)}>取消</Btn><Btn onClick={create} disabled={busy}>创建</Btn></>}>
        <div className="space-y-3">
          <Field label="项目名称"><Input className="w-full" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus /></Field>
          <Field label="项目描述"><Textarea className="w-full h-24" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
        </div>
      </Modal>
    </>
  );
}
