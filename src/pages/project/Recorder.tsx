import { useEffect, useRef, useState } from "react";
import { webuiApi } from "@/api";
import type { RecorderStep } from "@/api/types";
import { useAsync } from "@/hooks/useAsync";
import { useApp } from "@/store/app";
import { Btn, Card, Select, Table, Tag } from "@/components/ui";

const CAPTURED: Omit<RecorderStep, "id">[] = [
  { action: "点击元素", target: "text=加入购物车", value: "" },
  { action: "等待", target: "1000ms", value: "" },
  { action: "点击元素", target: ".checkout-btn", value: "" },
  { action: "断言文本", target: ".order-success", value: "下单成功" },
  { action: "截图", target: "checkout_result.png", value: "" },
];

export function Recorder() {
  const { data, setData } = useAsync(() => webuiApi.recorderSteps(), [], [] as RecorderStep[]);
  const [recording, setRecording] = useState(false);
  const [browser, setBrowser] = useState("Chromium");
  const [elapsed, setElapsed] = useState(0);
  const timer = useRef<number | null>(null);
  const { addTask, toast } = useApp();

  useEffect(() => {
    if (!recording) return;
    const t = window.setInterval(() => setElapsed((v) => v + 1), 1000);
    return () => window.clearInterval(t);
  }, [recording]);

  useEffect(() => () => { if (timer.current) window.clearInterval(timer.current); }, []);

  const start = () => {
    setRecording(true);
    setElapsed(0);
    toast(`已在 ${browser} 中开始录制`);
    let i = 0;
    timer.current = window.setInterval(() => {
      const step = CAPTURED[i];
      if (!step) {
        if (timer.current) window.clearInterval(timer.current);
        timer.current = null;
        setRecording(false);
        toast("录制完成，已捕获操作步骤");
        return;
      }
      i += 1;
      void webuiApi.addRecorderStep(step).then(setData);
    }, 1500);
  };

  const stop = () => {
    setRecording(false);
    if (timer.current) window.clearInterval(timer.current);
    timer.current = null;
  };

  const replay = async () => {
    if (data.length === 0) { toast("暂无可回放步骤"); return; }
    addTask("录制回放 · 会话回放", "WebUI");
    await webuiApi.execute("US-1", browser);
    toast("回放完成，执行记录已生成");
  };

  const saveScript = async () => {
    const code = [
      "from playwright.sync_api import Page",
      "",
      "",
      "def test_recorded(page: Page):",
      ...data.map((s) => {
        if (s.action === "打开页面") return `    page.goto("${s.target}")`;
        if (s.action === "输入文本") return `    page.fill("${s.target}", "${s.value}")`;
        if (s.action === "点击元素") return `    page.click("${s.target}")`;
        if (s.action === "断言文本") return `    expect(page.locator("${s.target}")).to_contain_text("${s.value}")`;
        return `    page.wait_for_timeout(${Number.parseInt(s.target, 10) || 1000})`;
      }),
      "    page.screenshot(path=\"recorded.png\")",
    ].join("\n");
    await webuiApi.createScript(`录制脚本 ${new Date().toLocaleTimeString("zh-CN", { hour12: false })}`, code);
    toast("已保存为用例脚本");
  };

  const clear = async () => {
    setData(await webuiApi.clearRecorder());
    toast("步骤已清空");
  };

  return (
    <div className="grid grid-cols-3 gap-4">
      <Card title="录制控制">
        <div className="space-y-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-slate-500">浏览器</span>
            <Select opts={["Chromium", "Firefox", "WebKit"]} value={browser} onChange={(e) => setBrowser(e.target.value)} />
          </div>
          <div className={`rounded-md p-3 border ${recording ? "bg-rose-50 border-rose-200" : "bg-slate-50 border-slate-200"}`}>
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${recording ? "bg-rose-500 animate-pulse" : "bg-slate-300"}`} />
              <span>{recording ? "录制中" : "未开始"}</span>
              <span className="ml-auto font-mono text-slate-500">{Math.floor(elapsed / 60).toString().padStart(2, "0")}:{(elapsed % 60).toString().padStart(2, "0")}</span>
            </div>
            <div className="text-[11px] text-slate-500 mt-2">已捕获 {data.length} 个步骤</div>
          </div>
          <div className="flex gap-2">
            {recording ? <Btn v="danger" onClick={stop}>停止录制</Btn> : <Btn onClick={start}>开始录制</Btn>}
            <Btn v="ghost" onClick={replay}>回放</Btn>
          </div>
          <div className="flex gap-2">
            <Btn v="ghost" onClick={saveScript}>保存为脚本</Btn>
            <Btn v="ghost" onClick={clear}>清空步骤</Btn>
          </div>
          <div className="text-[11px] text-slate-500 leading-relaxed">录制会捕获点击、输入、等待与断言，回放结果写入「执行记录」并附带截图/视频。</div>
        </div>
      </Card>

      <Card title="操作步骤" className="col-span-2" extra={<Tag t={`${data.length} 步`} c="blue" />}>
        <Table cols={["#", "动作", "目标", "值"]} rows={data.map((s) => [String(s.id), s.action, <code key="t" className="text-[11px]">{s.target}</code>, s.value || "-"])} />
      </Card>
    </div>
  );
}
