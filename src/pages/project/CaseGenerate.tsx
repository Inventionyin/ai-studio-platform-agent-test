import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { requirementsApi, testcasesApi } from "@/api";
import type { TestCase } from "@/api/types";
import { useAsync } from "@/hooks/useAsync";
import { useApp } from "@/store/app";
import { MODELS } from "@/config/constants";
import { Btn, Card, Field, Input, Modal, Select, Table, Textarea } from "@/components/ui";

const STRATEGIES = ["正向流程", "边界值", "异常场景", "安全"];

export function CaseGenerate() {
  const [params] = useSearchParams();
  const { projectId, addTask, toast } = useApp();
  const navigate = useNavigate();
  const { data: reqs } = useAsync(() => requirementsApi.list(), [], []);
  const [src, setSrc] = useState(params.get("source") ?? "需求文档");
  const requirementId = params.get("requirement") ?? undefined;
  const [related, setRelated] = useState("");
  const [strategies, setStrategies] = useState<string[]>(["正向流程", "边界值", "异常场景"]);
  const [model, setModel] = useState("GPT-4o");
  const [rag, setRag] = useState(true);
  const [out, setOut] = useState<TestCase[]>([]);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<TestCase | null>(null);
  const [editForm, setEditForm] = useState({ title: "", steps: "", expected: "" });

  const gen = async () => {
    setBusy(true);
    setOut([]);
    addTask(`AI 生成用例 · ${src}`);
    try {
      const items = await testcasesApi.generate(src, requirementId);
      items.forEach((c, i) => {
        window.setTimeout(() => {
          setOut((prev) => [...prev, c]);
          if (i === items.length - 1) { setBusy(false); toast("用例草稿生成完成"); }
        }, 260 * (i + 1));
      });
    } catch (e) {
      setBusy(false);
      toast(e instanceof Error ? e.message : "生成失败");
    }
  };

  const submit = async () => {
    const count = await testcasesApi.submitReview(out);
    toast(`已提交 ${count} 条用例评审`);
    navigate(`/project/${projectId}/testcases/review`);
  };

  const openEdit = (c: TestCase) => {
    setEditing(c);
    setEditForm({ title: c.title, steps: c.steps.join("\n"), expected: c.expected });
  };

  const saveEdit = () => {
    if (!editing) return;
    setOut(out.map((c) => c.id === editing.id ? { ...c, title: editForm.title, steps: editForm.steps.split("\n").filter(Boolean), expected: editForm.expected } : c));
    setEditing(null);
    toast("草稿已更新");
  };

  const toggleStrategy = (s: string) => setStrategies((list) => list.includes(s) ? list.filter((x) => x !== s) : [...list, s]);

  return (
    <div className="grid grid-cols-5 gap-4">
      <Card title="生成配置" className="col-span-2">
        <div className="space-y-3 text-xs">
          {requirementId && <div className="text-[11px] text-blue-600 bg-blue-50 border border-blue-100 rounded px-2 py-1.5">输入来源绑定需求：{requirementId}</div>}
          <Field label="输入来源">
            <Select value={src} onChange={(e) => setSrc(e.target.value)} opts={["需求文档", "原型：会员中心", "接口设计：会员中心 API"]} className="w-full" />
          </Field>
          <Field label="关联需求">
            <Select opts={["不关联", ...reqs.map((r) => `${r.id} ${r.title}`)]} className="w-full" value={related} onChange={(e) => setRelated(e.target.value)} />
          </Field>
          <Field label="生成策略" as="div">
            <div className="flex flex-wrap gap-3 mt-1">
              {STRATEGIES.map((s) => (
                <label key={s} className="flex gap-1 items-center"><input type="checkbox" checked={strategies.includes(s)} onChange={() => toggleStrategy(s)} />{s}</label>
              ))}
            </div>
          </Field>
          <Field label="模型"><Select opts={MODELS} className="w-full" value={model} onChange={(e) => setModel(e.target.value)} /></Field>
          <label className="flex gap-2 items-center"><input type="checkbox" checked={rag} onChange={(e) => setRag(e.target.checked)} />启用知识库增强（RAG）</label>
          <Btn onClick={gen} disabled={busy || strategies.length === 0} className="w-full">{busy ? "生成中…" : "开始生成"}</Btn>
          <div className="text-[11px] text-slate-500 leading-relaxed">生成结果会推送到右下角任务悬浮窗，可在「任务与报告」查看历史。</div>
        </div>
      </Card>

      <Card title={`用例草稿（${out.length}）`} className="col-span-3" extra={out.length > 0 && !busy && <Btn onClick={submit}>提交评审</Btn>}>
        {out.length > 0 ? (
          <Table
            cols={["#", "标题", "类型", "优先级", "状态"]}
            rows={out.map((c) => [c.id, c.title, c.type, c.priority, c.status])}
            actions={(i) => (
              <>
                <Btn v="ghost" onClick={() => openEdit(out[i])}>编辑</Btn>
                <Btn v="danger" onClick={() => setOut(out.filter((_, idx) => idx !== i))}>移除</Btn>
              </>
            )}
          />
        ) : (
          <div className="h-60 grid place-items-center text-xs text-slate-500">{busy ? "正在生成…" : "暂无草稿"}</div>
        )}
      </Card>

      <Modal open={!!editing} title={editing ? `编辑草稿 · ${editing.id}` : ""} onClose={() => setEditing(null)} width="max-w-2xl" footer={<><Btn v="ghost" onClick={() => setEditing(null)}>取消</Btn><Btn onClick={saveEdit}>保存</Btn></>}>
        <div className="space-y-3">
          <Field label="标题"><Input className="w-full" value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} /></Field>
          <Field label="测试步骤" hint="每行一个步骤"><Textarea className="w-full h-28" value={editForm.steps} onChange={(e) => setEditForm({ ...editForm, steps: e.target.value })} /></Field>
          <Field label="预期结果"><Textarea className="w-full h-20" value={editForm.expected} onChange={(e) => setEditForm({ ...editForm, expected: e.target.value })} /></Field>
        </div>
      </Modal>
    </div>
  );
}
