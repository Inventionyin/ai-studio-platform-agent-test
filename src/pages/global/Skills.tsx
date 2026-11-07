import { useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { skillsApi } from "@/api";
import type { Skill } from "@/api/types";
import { useAsync } from "@/hooks/useAsync";
import { useApp } from "@/store/app";
import { useAuth } from "@/store/auth";
import { Btn, Card, Empty, Field, Input, Modal, Tag, Textarea } from "@/components/ui";
import { cx } from "@/lib/cx";

const CATEGORIES = ["全部", "需求", "用例", "接口", "数据", "诊断"];

export function Skills() {
  const location = useLocation();
  const isMcp = location.pathname.endsWith("/mcp");
  const kind: Skill["kind"] = isMcp ? "MCP" : "Skill";
  const { data, setData } = useAsync(() => skillsApi.list(kind), [kind], [] as Skill[]);
  const [tag, setTag] = useState("全部");
  const [query, setQuery] = useState("");
  const [detail, setDetail] = useState<Skill | null>(null);
  const [editing, setEditing] = useState<Skill | null>(null);
  const [form, setForm] = useState({ name: "", description: "", category: "", params: "[]", prompt: "" });
  const fileRef = useRef<HTMLInputElement>(null);
  const { projectId, toast } = useApp();
  const { user } = useAuth();
  const canEdit = user?.role === "管理员" || user?.role === "开发者";
  const navigate = useNavigate();

  const list = data.filter((item) => (tag === "全部" || item.category === tag) && (!query || item.name.includes(query) || item.description.includes(query)));

  const addToWorkflow = async (skill: Skill) => {
    await skillsApi.use(skill.id);
    navigate(`/project/${projectId}/ai/workflow?skill=${encodeURIComponent(skill.name)}`);
  };

  const openEdit = (skill: Skill) => {
    setEditing(skill);
    setForm({
      name: skill.name,
      description: skill.description,
      category: skill.category,
      params: JSON.stringify(skill.params ?? [], null, 2),
      prompt: skill.prompt ?? "",
    });
  };

  const save = async () => {
    if (!editing) return;
    let params: Skill["params"];
    try {
      params = JSON.parse(form.params) as Skill["params"];
      if (!Array.isArray(params)) throw new Error("参数必须是数组");
    } catch {
      toast("参数必须是合法 JSON 数组");
      return;
    }
    try {
      const updated = await skillsApi.update(editing.id, {
        name: form.name,
        description: form.description,
        category: form.category,
        params,
        prompt: form.prompt,
      });
      setData(data.map((item) => item.id === updated.id ? updated : item));
      setEditing(null);
      setDetail(updated);
      toast("技能已更新");
    } catch (err) {
      toast(err instanceof Error ? err.message : "保存失败");
    }
  };

  const importSkill = async (file: File) => {
    try {
      const skill = await skillsApi.importSkill(file);
      setData([skill, ...data]);
      toast(`已导入技能：${skill.name}`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "导入失败");
    }
  };

  return (
    <div>
      <div className="flex gap-2 mb-4">
        {CATEGORIES.map((t) => (
          <button key={t} onClick={() => setTag(t)} className={cx("px-3 h-7 rounded-full text-xs border", tag === t ? "bg-blue-600 text-white border-blue-600" : "bg-white border-slate-300")}>{t}</button>
        ))}
        <div className="flex-1" />
        <Input placeholder={isMcp ? "搜索 MCP 工具" : "搜索技能"} value={query} onChange={(e) => setQuery(e.target.value)} />
        {canEdit && !isMcp && (
          <>
            <Btn v="ghost" onClick={() => fileRef.current?.click()}>导入 SKILL.md</Btn>
            <input ref={fileRef} type="file" accept=".md" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) void importSkill(file); e.target.value = ""; }} />
          </>
        )}
      </div>

      {list.length === 0 ? (
        <Card><Empty text="没有匹配的技能" /></Card>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {list.map((skill) => (
            <Card key={skill.id}>
              <div className="flex justify-between">
                <div className="font-medium text-sm">{skill.name}</div>
                <Tag t={isMcp ? "MCP" : "Skill"} c={isMcp ? "amber" : "blue"} />
              </div>
              <div className="text-xs text-slate-500 mt-1 h-8">{skill.description}</div>
              <div className="flex justify-between items-center mt-3">
                <span className="text-[11px] text-slate-500">调用 {skill.calls} 次 · {skill.version}</span>
                <div className="flex gap-1">
                  <Btn v="ghost" onClick={() => setDetail(skill)}>详情</Btn>
                  {canEdit && <Btn v="ghost" onClick={() => openEdit(skill)}>编辑</Btn>}
                  <Btn onClick={() => { void addToWorkflow(skill); toast(`已加入编排器：${skill.name}`); }}>添加到工作流</Btn>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={!!detail} title={detail ? `${detail.name} · ${detail.version}` : ""} onClose={() => setDetail(null)} footer={detail && canEdit ? <Btn onClick={() => { const target = detail; setDetail(null); openEdit(target); }}>编辑技能</Btn> : undefined}>
        {detail && (
          <div className="text-xs space-y-3">
            <p className="text-slate-600 leading-relaxed">{detail.description}</p>
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-slate-50 rounded p-2"><div className="text-slate-500 text-[11px]">分类</div>{detail.category}</div>
              <div className="bg-slate-50 rounded p-2"><div className="text-slate-500 text-[11px]">类型</div>{detail.kind}</div>
              <div className="bg-slate-50 rounded p-2"><div className="text-slate-500 text-[11px]">调用次数</div>{detail.calls}</div>
            </div>
            <div>
              <div className="font-medium text-slate-700 mb-2">参数说明</div>
              <table className="w-full text-xs">
                <thead><tr className="bg-slate-50 text-slate-500 text-left"><th className="px-2 py-1.5">参数</th><th className="px-2 py-1.5">类型</th><th className="px-2 py-1.5">必填</th><th className="px-2 py-1.5">说明</th></tr></thead>
                <tbody>
                  {detail.params.map((param) => (
                    <tr key={param.name} className="border-t border-slate-100">
                      <td className="px-2 py-1.5 font-mono">{param.name}</td>
                      <td className="px-2 py-1.5">{param.type}</td>
                      <td className="px-2 py-1.5">{param.required ? <Tag t="必填" c="amber" /> : "否"}</td>
                      <td className="px-2 py-1.5 text-slate-600">{param.desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {detail.prompt && <div><div className="font-medium text-slate-700 mb-1">提示词</div><pre className="bg-slate-900 text-emerald-300 rounded p-3 text-[11px] max-h-48 overflow-auto whitespace-pre-wrap">{detail.prompt}</pre></div>}
          </div>
        )}
      </Modal>

      <Modal open={!!editing} title={editing ? `编辑技能 · ${editing.name}` : ""} onClose={() => setEditing(null)} width="max-w-2xl" footer={<><Btn v="ghost" onClick={() => setEditing(null)}>取消</Btn><Btn onClick={save}>保存</Btn></>}>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="名称"><Input className="w-full" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="分类"><Input className="w-full" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></Field>
          </div>
          <Field label="描述"><Textarea className="w-full h-20" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
          <Field label="参数（JSON 数组）"><Textarea className="w-full h-32 font-mono text-[11px]" value={form.params} onChange={(e) => setForm({ ...form, params: e.target.value })} /></Field>
          <Field label="提示词"><Textarea className="w-full h-48 font-mono text-[11px]" value={form.prompt} onChange={(e) => setForm({ ...form, prompt: e.target.value })} /></Field>
        </div>
      </Modal>
    </div>
  );
}
