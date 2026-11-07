import { useEffect, useState } from "react";
import { webuiApi } from "@/api";
import type { UiScript } from "@/api/types";
import { useAsync } from "@/hooks/useAsync";
import { useApp } from "@/store/app";
import { Btn, Card, Empty, Input, Modal, Select, Tag } from "@/components/ui";
import { MonacoEditor } from "@/components/business";

const NEW_TEMPLATE = `from pages.login import LoginPage


def test_new_script(page):
    LoginPage(page).login("demo", "demo123")
`;

export function UiScripts() {
  const { data, setData } = useAsync(() => webuiApi.scripts(), [], [] as UiScript[]);
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [browser, setBrowser] = useState("Chromium");
  const { addTask, toast } = useApp();
  const script = data.find((s) => s.id === selected) ?? data[0];

  useEffect(() => {
    if (script) {
      setSelected(script.id);
      setDraft(script.content);
    }
  }, [script?.id]);

  const save = async () => {
    if (!script) return;
    const updated = await webuiApi.saveScript(script.id, draft);
    setData(data.map((s) => (s.id === updated.id ? updated : s)));
    toast("脚本已保存");
  };

  const run = async () => {
    if (!script) return;
    addTask(`WebUI 执行 · ${script.name}`, "WebUI");
    await webuiApi.execute(script.id, browser);
    toast(`${browser} 执行完成，已生成截图与视频`);
  };

  const create = async () => {
    if (!name.trim()) { toast("请输入脚本名称"); return; }
    const created = await webuiApi.createScript(name, NEW_TEMPLATE);
    setData([created, ...data]);
    setSelected(created.id);
    setOpen(false);
    setName("");
    toast("脚本已创建");
  };

  return (
    <>
      <div className="grid grid-cols-4 gap-4">
        <Card title="用例脚本" extra={<Btn v="ghost" onClick={() => setOpen(true)}>+ 新建</Btn>}>
          {data.length === 0 && <Empty text="暂无脚本" />}
          {data.map((s) => (
            <button key={s.id} onClick={() => setSelected(s.id)} className={`w-full text-left px-2 py-2 rounded text-xs ${script?.id === s.id ? "bg-blue-50 text-blue-700" : "hover:bg-slate-50"}`}>
              <div className="flex justify-between gap-2"><span className="truncate">{s.name}</span><Tag t={s.status} /></div>
              <div className="text-[11px] text-slate-500 mt-0.5">{s.framework} · {s.updatedAt}</div>
            </button>
          ))}
        </Card>

        <Card className="col-span-3" title={script ? `脚本编辑 · ${script.name}` : "脚本编辑"} extra={
          <div className="flex items-center gap-2">
            <Select opts={["Chromium", "Firefox", "WebKit"]} value={browser} onChange={(e) => setBrowser(e.target.value)} />
            <Btn v="ghost" onClick={save}>保存</Btn>
            <Btn onClick={run}>运行</Btn>
          </div>
        }>
          {script ? (
            <MonacoEditor value={draft} onChange={setDraft} language="python" height={460} path={`${script.id}.py`} />
          ) : (
            <Empty text="请选择或新建脚本" />
          )}
        </Card>
      </div>

      <Modal open={open} title="新建用例脚本" onClose={() => setOpen(false)} footer={<><Btn v="ghost" onClick={() => setOpen(false)}>取消</Btn><Btn onClick={create}>创建</Btn></>}>
        <div className="space-y-3 text-xs">
          <div>脚本名称</div>
          <Input className="w-full" value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：支付流程回归" autoFocus />
          <div className="text-[11px] text-slate-500">默认使用 Playwright + POM 模板创建。</div>
        </div>
      </Modal>
    </>
  );
}
