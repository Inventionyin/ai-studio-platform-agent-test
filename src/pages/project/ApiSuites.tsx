import { useState } from "react";
import { apiTestApi } from "@/api";
import type { ApiSuite } from "@/api/types";
import { useAsync } from "@/hooks/useAsync";
import { useApp } from "@/store/app";
import { copyText } from "@/lib/copy";
import { Btn, Card, Field, Input, Modal, Table, Toolbar } from "@/components/ui";

export function ApiSuites() {
  const { data, setData } = useAsync(() => apiTestApi.suites(), [], [] as ApiSuite[]);
  const { addTask, toast } = useApp();
  const [running, setRunning] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", cron: "0 2 * * *", count: "10" });

  const run = async (suite: ApiSuite) => {
    setRunning(suite.id);
    addTask(`套件执行 · ${suite.name}`, "测试执行");
    const updated = await apiTestApi.runSuite(suite.id);
    setData(data.map((s) => (s.id === updated.id ? updated : s)));
    setRunning(null);
    toast(`套件「${suite.name}」执行完成`);
  };

  const create = async () => {
    if (!form.name.trim()) { toast("请输入套件名称"); return; }
    const suite = await apiTestApi.createSuite({ name: form.name, cron: form.cron, count: Number(form.count) || 0 });
    setData([suite, ...data]);
    setOpen(false);
    setForm({ name: "", cron: "0 2 * * *", count: "10" });
    toast("套件已创建");
  };

  const copyCron = async (cron: string) => {
    toast((await copyText(cron)) ? `已复制 Cron：${cron}` : `Cron：${cron}`);
  };

  return (
    <>
      <Card>
        <Toolbar placeholder="搜索套件" filters={<span />}>
          <Btn onClick={() => setOpen(true)}>+ 新建套件</Btn>
        </Toolbar>
        <Table
          cols={["套件", "接口数", "Cron", "上次结果", "状态"]}
          rows={data.map((s) => [s.name, String(s.count), <code key="c" className="text-[11px]">{s.cron}</code>, s.lastResult, s.status])}
          actions={(i) => (
            <>
              <Btn v="ghost" disabled={running === data[i].id} onClick={() => run(data[i])}>{running === data[i].id ? "执行中…" : "立即执行"}</Btn>
              <Btn v="ghost" onClick={() => copyCron(data[i].cron)}>复制 Cron</Btn>
            </>
          )}
        />
      </Card>

      <Modal open={open} title="新建套件" onClose={() => setOpen(false)} footer={<><Btn v="ghost" onClick={() => setOpen(false)}>取消</Btn><Btn onClick={create}>创建</Btn></>}>
        <div className="space-y-3">
          <Field label="套件名称"><Input className="w-full" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="例如：夜间全量回归" autoFocus /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Cron 表达式" hint="分 时 日 月 周"><Input className="w-full font-mono" value={form.cron} onChange={(e) => setForm({ ...form, cron: e.target.value })} /></Field>
            <Field label="接口数"><Input className="w-full" value={form.count} onChange={(e) => setForm({ ...form, count: e.target.value })} /></Field>
          </div>
        </div>
      </Modal>
    </>
  );
}
