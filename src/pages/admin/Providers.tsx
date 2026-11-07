import { useState } from "react";
import { adminApi } from "@/api";
import type { ModelProvider } from "@/api/types";
import { useAsync } from "@/hooks/useAsync";
import { useApp } from "@/store/app";
import { Btn, Card, Field, Input, Modal, Select, Table, Toolbar } from "@/components/ui";

const EMPTY = { name: "", models: "", apiKey: "", baseUrl: "" };

export function Providers() {
  const { data, setData, reload } = useAsync(() => adminApi.providers(), [], [] as ModelProvider[]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ModelProvider | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("全部状态");
  const { toast } = useApp();

  const list = data.filter((p) => (status === "全部状态" || p.status === status) && (!query || p.name.includes(query) || p.models.includes(query)));

  const openCreate = () => { setEditing(null); setForm(EMPTY); setOpen(true); };
  const openEdit = (p: ModelProvider) => { setEditing(p); setForm({ name: p.name, models: p.models, apiKey: "", baseUrl: p.baseUrl }); setOpen(true); };

  const save = async () => {
    if (!form.name.trim()) { toast("请输入供应商名称"); return; }
    if (editing) {
      const patch = { name: form.name, models: form.models, baseUrl: form.baseUrl, ...(form.apiKey ? { apiKey: form.apiKey } : {}) };
      setData(await adminApi.updateProvider(editing.id, patch));
      toast("供应商已更新");
    } else {
      const created = await adminApi.addProvider(form);
      setData([...data, created]);
      toast("供应商已添加");
    }
    setOpen(false);
  };

  const test = async (id: string) => {
    setBusy(id);
    setData(await adminApi.testProvider(id));
    setBusy(null);
    toast("连接测试完成");
  };

  return (
    <>
      <Card>
        <Toolbar placeholder="搜索供应商/模型" onSearch={setQuery} filters={<Select opts={["全部状态", "正常", "异常", "未检测"]} value={status} onChange={(e) => setStatus(e.target.value)} />}>
          <Btn v="ghost" onClick={reload}>刷新</Btn>
          <Btn onClick={openCreate}>+ 添加供应商</Btn>
        </Toolbar>
        <Table
          cols={["供应商", "可用模型", "Base URL", "API Key", "连通性"]}
          rows={list.map((p) => [
            p.name,
            p.models,
            <code key="u" className="text-[11px]">{p.baseUrl}</code>,
            <code key="k" className="text-[11px]">{p.apiKey}</code>,
            p.status,
          ])}
          actions={(i) => (
            <>
              <Btn v="ghost" disabled={busy === list[i].id} onClick={() => test(list[i].id)}>{busy === list[i].id ? "检测中…" : "连接测试"}</Btn>
              <Btn v="ghost" onClick={() => openEdit(list[i])}>编辑</Btn>
            </>
          )}
        />
      </Card>

      <Modal open={open} title={editing ? `编辑供应商 · ${editing.name}` : "添加模型供应商"} onClose={() => setOpen(false)} footer={<><Btn v="ghost" onClick={() => setOpen(false)}>取消</Btn><Btn onClick={save}>保存</Btn></>}>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="供应商名称"><Input className="w-full" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="OpenAI" autoFocus /></Field>
            <Field label="可用模型" hint="多个模型用逗号分隔"><Input className="w-full" value={form.models} onChange={(e) => setForm({ ...form, models: e.target.value })} placeholder="gpt-4o, gpt-4o-mini" /></Field>
          </div>
          <Field label="Base URL"><Input className="w-full font-mono" value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} placeholder="https://api.openai.com/v1" /></Field>
          <Field label="API Key" hint={editing ? "留空表示不修改；平台以 AES 加密存储，不回显明文" : "平台以 AES 加密存储，不回显明文"}><Input className="w-full font-mono" type="password" value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} placeholder={editing ? "留空保持不变" : "sk-..."} /></Field>
        </div>
      </Modal>
    </>
  );
}
