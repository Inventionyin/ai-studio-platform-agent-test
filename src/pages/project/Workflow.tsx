import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { WORKFLOW_TEMPLATES, workflowApi } from "@/api";
import type { WorkflowDef, WorkflowNode } from "@/api/types";
import { useAsync } from "@/hooks/useAsync";
import { useApp } from "@/store/app";
import { MODELS } from "@/config/constants";
import { Btn, Card, Field, Input, Select } from "@/components/ui";
import { cx } from "@/lib/cx";

const NODE_TYPES: [string, string][] = [["LLM 调用", "bg-blue-500"], ["工具/Skill", "bg-amber-500"], ["知识库检索", "bg-emerald-500"], ["条件分支", "bg-violet-500"], ["代码节点", "bg-slate-600"]];
const STATE_TEXT: Record<string, string> = { pending: "待执行", running: "执行中", success: "成功" };

export function Workflow() {
  const [params] = useSearchParams();
  const skill = params.get("skill");
  const { data: saved } = useAsync(() => workflowApi.list(), [], [] as WorkflowDef[]);
  const [nodes, setNodes] = useState<WorkflowNode[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [states, setStates] = useState<Record<number, "pending" | "running" | "success">>({});
  const [running, setRunning] = useState(false);
  const [name, setName] = useState("需求→原型");
  const { addTask, toast } = useApp();

  useEffect(() => {
    const base = WORKFLOW_TEMPLATES["需求→原型"].map((n) => ({ ...n, config: { ...n.config } }));
    const initial = skill ? [...base, { id: Date.now(), type: "工具/Skill", label: skill, x: 410, y: 240, config: {} }] : base;
    setNodes(initial);
    const stateMap: Record<number, "pending" | "running" | "success"> = {};
    initial.forEach((n) => { stateMap[n.id] = "pending"; });
    setStates(stateMap);
  }, [skill]);

  const color = (type: string) => NODE_TYPES.find((n) => n[0] === type)?.[1] ?? "bg-slate-900";
  const current = nodes.find((n) => n.id === selected);

  const addNode = (type: string) => {
    const node: WorkflowNode = { id: Date.now(), type, label: type, x: 60 + (nodes.length % 4) * 170, y: 280, config: {} };
    setNodes([...nodes, node]);
    setSelected(node.id);
  };

  const applyTemplate = (templateName: string) => {
    const next = WORKFLOW_TEMPLATES[templateName].map((n) => ({ ...n, config: { ...n.config } }));
    setNodes(next);
    setName(templateName);
    setSelected(null);
    setStates(Object.fromEntries(next.map((n) => [n.id, "pending"])));
  };

  const save = async () => {
    await workflowApi.save(name, nodes);
    toast(`工作流「${name}」已保存`);
  };

  const run = async () => {
    if (nodes.length === 0) return;
    setRunning(true);
    addTask(`工作流试运行 · ${name}`, "工作流");
    setStates(Object.fromEntries(nodes.map((n) => [n.id, "pending"])));
    for (const n of nodes) {
      setStates((s) => ({ ...s, [n.id]: "running" }));
      await new Promise((r) => setTimeout(r, 380));
      setStates((s) => ({ ...s, [n.id]: "success" }));
    }
    await workflowApi.run(name, nodes);
    setRunning(false);
    toast("试运行完成，所有节点执行成功");
  };

  return (
    <div className="grid grid-cols-5 gap-4">
      <Card title="节点库">
        {NODE_TYPES.map(([t, c]) => (
          <button key={t} onClick={() => addNode(t)} className="w-full flex items-center gap-2 px-2 py-2 rounded hover:bg-slate-50 text-xs"><span className={cx("w-2.5 h-2.5 rounded-sm", c)} />{t}</button>
        ))}
        <div className="text-[11px] text-slate-500 mt-4 mb-1">预置模板</div>
        {["需求→原型", "需求→接口"].map((t) => (
          <button key={t} onClick={() => applyTemplate(t)} className="w-full text-left px-2 py-1.5 text-xs text-blue-600 hover:bg-blue-50 rounded">{t}</button>
        ))}
        <div className="text-[11px] text-slate-500 mt-4 mb-1">已保存工作流</div>
        {saved.length === 0 && <div className="px-2 text-[11px] text-slate-500">暂无</div>}
        {saved.map((w) => (
          <button key={w.id} onClick={() => { setNodes(w.nodes); setName(w.name); setSelected(null); }} className="w-full text-left px-2 py-1.5 text-xs hover:bg-slate-50 rounded">
            {w.name}<div className="text-[10px] text-slate-500">{w.updatedAt}</div>
          </button>
        ))}
      </Card>

      <section className="col-span-3 bg-white rounded-lg border relative h-[480px] overflow-hidden" style={{ backgroundImage: "radial-gradient(#cbd5e1 1px, transparent 1px)", backgroundSize: "16px 16px" }}>
        <div className="absolute top-3 right-3 flex gap-2 z-10">
          <Input value={name} onChange={(e) => setName(e.target.value)} className="w-36" />
          <Btn v="ghost" onClick={save}>保存</Btn>
          <Btn onClick={run} disabled={running}>{running ? "运行中…" : "试运行"}</Btn>
        </div>
        <svg className="absolute inset-0 w-full h-full pointer-events-none">
          {nodes.slice(1).map((n, i) => {
            const p = nodes[i];
            return <path key={n.id} d={`M${p.x + 150},${p.y + 22} C${p.x + 180},${p.y + 22} ${n.x - 30},${n.y + 22} ${n.x},${n.y + 22}`} stroke="#94a3b8" strokeWidth="1.5" fill="none" />;
          })}
        </svg>
        {nodes.map((n) => (
          <button key={n.id} onClick={() => setSelected(n.id)} className={cx("absolute w-[150px] bg-white rounded-md border shadow-sm text-left overflow-hidden", selected === n.id ? "ring-2 ring-blue-500" : "border-slate-300")} style={{ left: n.x, top: n.y }}>
            <div className={cx("text-[10px] text-white px-2 py-0.5 flex justify-between", color(n.type))}>
              <span>{n.type}</span>
              {states[n.id] && <span>{states[n.id] === "running" ? "…" : states[n.id] === "success" ? "✓" : ""}</span>}
            </div>
            <div className="px-2 py-1.5 text-xs truncate">{n.label}</div>
            {states[n.id] && <div className={cx("px-2 pb-1 text-[10px]", states[n.id] === "success" ? "text-emerald-600" : states[n.id] === "running" ? "text-amber-600" : "text-slate-500")}>{STATE_TEXT[states[n.id]]}</div>}
          </button>
        ))}
      </section>

      <Card title="节点配置">
        {current ? (
          <div className="space-y-3 text-xs">
            <Field label="名称"><Input value={current.label} onChange={(e) => setNodes(nodes.map((n) => n.id === current.id ? { ...n, label: e.target.value } : n))} className="w-full" /></Field>
            <Field label="类型"><Input value={current.type} readOnly className="w-full" /></Field>
            {(current.type === "LLM 调用" || current.type === "工具/Skill") && (
              <Field label="模型"><Select opts={MODELS} className="w-full" value={current.config.model ?? "GPT-4o"} onChange={(e) => setNodes(nodes.map((n) => n.id === current.id ? { ...n, config: { ...n.config, model: e.target.value } } : n))} /></Field>
            )}
            {current.type === "LLM 调用" && (
              <Field label="Prompt"><Input value={current.config.prompt ?? ""} onChange={(e) => setNodes(nodes.map((n) => n.id === current.id ? { ...n, config: { ...n.config, prompt: e.target.value } } : n))} className="w-full" placeholder="例如：输出页面结构 JSON" /></Field>
            )}
            {current.type === "知识库检索" && (
              <>
                <Field label="知识库"><Select opts={["业务规则库", "接口文档库"]} className="w-full" value={current.config.kb ?? "业务规则库"} onChange={(e) => setNodes(nodes.map((n) => n.id === current.id ? { ...n, config: { ...n.config, kb: e.target.value } } : n))} /></Field>
                <Field label="Top K"><Input value={current.config.topK ?? "5"} onChange={(e) => setNodes(nodes.map((n) => n.id === current.id ? { ...n, config: { ...n.config, topK: e.target.value } } : n))} className="w-full" /></Field>
              </>
            )}
            {current.type === "工具/Skill" && <div className="text-[11px] text-slate-500">已插入技能：{current.label}，参数在运行前由上游变量填充。</div>}
            <Field label="超时（秒）"><Input defaultValue="120" className="w-full" /></Field>
            <Btn v="danger" onClick={() => { setNodes(nodes.filter((n) => n.id !== current.id)); setSelected(null); }}>删除节点</Btn>
          </div>
        ) : (
          <div className="text-xs text-slate-500">选择画布中的节点进行配置</div>
        )}
      </Card>
    </div>
  );
}
