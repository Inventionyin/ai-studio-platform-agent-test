import { useEffect, useState } from "react";
import { appAutoApi } from "@/api";
import type { FlowNode } from "@/api/types";
import { useAsync } from "@/hooks/useAsync";
import { useApp } from "@/store/app";
import { Btn, Card, Field, Input, Select } from "@/components/ui";
import { cx } from "@/lib/cx";

const NODE_TYPES: [string, string][] = [
  ["启动 App", "bg-slate-600"],
  ["点击", "bg-blue-500"],
  ["输入", "bg-indigo-500"],
  ["滑动", "bg-cyan-600"],
  ["等待", "bg-slate-500"],
  ["图像识别", "bg-emerald-500"],
  ["断言", "bg-violet-500"],
];

const DEFAULT_CONFIG: Record<string, string> = {
  "启动 App": "package=com.demo.member",
  点击: "x=540, y=2280",
  输入: "text=13800000000",
  滑动: "from=540,1900 to=540,600",
  等待: "ms=1000",
  图像识别: "template=icon.png, threshold=0.9",
  断言: "ocr=会员昵称",
};

export function UiFlow() {
  const { data, setData } = useAsync(() => appAutoApi.flows(), [], [] as FlowNode[]);
  const [nodes, setNodes] = useState<FlowNode[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [device, setDevice] = useState("Pixel 7");
  const { addTask, toast } = useApp();

  useEffect(() => { setNodes(data); }, [data]);

  const add = (type: string) => {
    const node: FlowNode = { id: `F-${Date.now()}`, type, label: type, config: DEFAULT_CONFIG[type] ?? "" };
    setNodes([...nodes, node]);
    setSelected(node.id);
  };

  const current = nodes.find((n) => n.id === selected);
  const color = (type: string) => NODE_TYPES.find((n) => n[0] === type)?.[1] ?? "bg-slate-900";

  const save = async () => {
    setData(await appAutoApi.saveFlow(nodes));
    toast("UI Flow 已保存");
  };

  const run = async () => {
    if (nodes.length === 0) { toast("请先添加流程节点"); return; }
    addTask("App Flow 执行 · 会员中心", "App");
    await appAutoApi.execute("会员中心巡检", device);
    toast(`已在 ${device} 上执行完成`);
  };

  return (
    <div className="grid grid-cols-5 gap-4">
      <Card title="步骤库">
        {NODE_TYPES.map(([t, c]) => (
          <button key={t} onClick={() => add(t)} className="w-full flex items-center gap-2 px-2 py-2 rounded hover:bg-slate-50 text-xs">
            <span className={cx("w-2.5 h-2.5 rounded-sm", c)} />{t}
          </button>
        ))}
        <div className="text-[11px] text-slate-500 mt-4 leading-relaxed">图像识别节点基于 OCR / 模板匹配定位控件，适合跨分辨率设备。</div>
      </Card>

      <section className="col-span-3 bg-white rounded-lg border relative h-[480px] overflow-auto" style={{ backgroundImage: "radial-gradient(#cbd5e1 1px, transparent 1px)", backgroundSize: "16px 16px" }}>
        <div className="absolute top-3 right-3 flex gap-2 z-10">
          <Select opts={["Pixel 7", "iPhone 15", "Pixel 6", "Mi 13"]} value={device} onChange={(e) => setDevice(e.target.value)} />
          <Btn v="ghost" onClick={save}>保存</Btn>
          <Btn onClick={run}>试运行</Btn>
        </div>
        <div className="absolute left-6 top-16 w-[300px] space-y-3">
          {nodes.length === 0 && <div className="text-xs text-slate-500 mt-20 text-center">从左侧添加步骤，构建 App 自动化流程</div>}
          {nodes.map((n, i) => (
            <div key={n.id} className="relative">
              <button onClick={() => setSelected(n.id)} className={cx("w-full bg-white rounded-md border shadow-sm text-left overflow-hidden", selected === n.id ? "ring-2 ring-blue-500" : "border-slate-300")}>
                <div className={cx("text-[10px] text-white px-2 py-0.5 flex justify-between", color(n.type))}>
                  <span>{i + 1} · {n.type}</span>
                  <span>{n.type === "图像识别" ? "AI" : ""}</span>
                </div>
                <div className="px-2 py-1.5 text-xs truncate">{n.label}</div>
                <div className="px-2 pb-1.5 text-[10px] text-slate-500 font-mono truncate">{n.config}</div>
              </button>
              {i < nodes.length - 1 && <div className="h-3 border-l-2 border-dashed border-slate-300 ml-6" />}
            </div>
          ))}
        </div>
      </section>

      <Card title="节点配置">
        {current ? (
          <div className="space-y-3 text-xs">
            <Field label="步骤名称"><Input className="w-full" value={current.label} onChange={(e) => setNodes(nodes.map((n) => n.id === current.id ? { ...n, label: e.target.value } : n))} /></Field>
            <Field label="节点类型"><Input className="w-full" value={current.type} readOnly /></Field>
            <Field label="参数配置" hint="key=value，多个参数用逗号分隔"><Input className="w-full font-mono" value={current.config} onChange={(e) => setNodes(nodes.map((n) => n.id === current.id ? { ...n, config: e.target.value } : n))} /></Field>
            <div className="flex gap-2 pt-2">
              <Btn v="ghost" onClick={() => setNodes(nodes.map((n) => n.id === current.id ? { ...n, label: n.type, config: DEFAULT_CONFIG[n.type] ?? "" } : n))}>重置</Btn>
              <Btn v="danger" onClick={() => { setNodes(nodes.filter((n) => n.id !== current.id)); setSelected(null); }}>删除节点</Btn>
            </div>
          </div>
        ) : (
          <div className="text-xs text-slate-500">选择画布中的步骤进行配置</div>
        )}
      </Card>
    </div>
  );
}
