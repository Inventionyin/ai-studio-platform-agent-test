import { useState } from "react";
import { mcpApi } from "@/api";
import type { McpServer } from "@/api/types";
import { useAsync } from "@/hooks/useAsync";
import { useApp } from "@/store/app";
import { confirmDelete } from "@/lib/confirm";
import { Btn, Card, Field, Input, Modal, Table, Tag, Textarea, Toolbar } from "@/components/ui";
import { DetailDrawer } from "@/components/business";

const EMPTY = { name: "", description: "", command: "python", args: "", env: "" };

function parseArgs(value: string): string[] {
  return value.split(/\s+/).map((item) => item.trim()).filter(Boolean);
}

function parseEnv(value: string): Record<string, string> {
  const env: Record<string, string> = {};
  value.split("\n").forEach((line) => {
    const index = line.indexOf("=");
    if (index > 0) env[line.slice(0, index).trim()] = line.slice(index + 1).trim();
  });
  return env;
}

export function McpServers() {
  const { data, setData } = useAsync(() => mcpApi.list(), [], [] as McpServer[]);
  const { toast } = useApp();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<McpServer | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState<string | null>(null);
  const [detail, setDetail] = useState<McpServer | null>(null);

  const openCreate = () => { setEditing(null); setForm(EMPTY); setOpen(true); };
  const openEdit = (server: McpServer) => {
    setEditing(server);
    setForm({
      name: server.name,
      description: server.description,
      command: server.command,
      args: server.args.join(" "),
      env: "",
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.name.trim() || !form.command.trim()) { toast("请填写名称与启动命令"); return; }
    try {
      if (editing) {
        const updated = await mcpApi.update(editing.id, {
          name: form.name,
          description: form.description,
          command: form.command,
          args: parseArgs(form.args),
          ...(form.env.trim() ? { env: parseEnv(form.env) } : {}),
        });
        setData(data.map((item) => item.id === updated.id ? updated : item));
        toast("MCP 服务已更新");
      } else {
        const created = await mcpApi.create({
          name: form.name,
          description: form.description,
          command: form.command,
          args: parseArgs(form.args),
          env: parseEnv(form.env),
        });
        setData([...data, created]);
        toast("MCP 服务已创建");
      }
      setOpen(false);
    } catch (err) {
      toast(err instanceof Error ? err.message : "保存失败");
    }
  };

  const test = async (server: McpServer) => {
    setBusy(server.id);
    try {
      const updated = await mcpApi.test(server.id);
      setData(data.map((item) => item.id === updated.id ? updated : item));
      setDetail(updated);
      toast(updated.status === "正常" ? `连接成功，发现 ${updated.tools.length} 个工具` : "连接失败");
    } catch (err) {
      toast(err instanceof Error ? err.message : "连接失败");
    } finally {
      setBusy(null);
    }
  };

  const remove = async (server: McpServer) => {
    if (!confirmDelete(server.name)) return;
    await mcpApi.remove(server.id);
    setData(data.filter((item) => item.id !== server.id));
    toast("MCP 服务已删除");
  };

  return (
    <>
      <Card>
        <Toolbar placeholder="搜索 MCP 服务" filters={<span />}>
          <Btn onClick={openCreate}>+ 登记 MCP 服务</Btn>
        </Toolbar>
        <Table
          cols={["名称", "启动命令", "环境变量", "工具数", "状态", "最近测试"]}
          rows={data.map((server) => [
            server.name,
            <code key="c" className="text-[11px]">{[server.command, ...server.args].join(" ")}</code>,
            server.envKeys.length ? server.envKeys.join(", ") : "-",
            String(server.tools.length),
            server.status,
            server.lastTestedAt ? new Date(server.lastTestedAt).toLocaleString("zh-CN", { hour12: false }) : "-",
          ])}
          actions={(i) => (
            <>
              <Btn v="ghost" onClick={() => setDetail(data[i])}>详情</Btn>
              <Btn v="ghost" disabled={busy === data[i].id} onClick={() => test(data[i])}>{busy === data[i].id ? "检测中…" : "连接测试"}</Btn>
              <Btn v="ghost" onClick={() => openEdit(data[i])}>编辑</Btn>
              <Btn v="danger" onClick={() => remove(data[i])}>删除</Btn>
            </>
          )}
        />
      </Card>

      <Modal open={open} title={editing ? `编辑 MCP 服务 · ${editing.name}` : "登记 MCP 服务"} onClose={() => setOpen(false)} width="max-w-2xl" footer={<><Btn v="ghost" onClick={() => setOpen(false)}>取消</Btn><Btn onClick={save}>保存</Btn></>}>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="名称"><Input className="w-full" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="启动命令"><Input className="w-full font-mono" value={form.command} onChange={(e) => setForm({ ...form, command: e.target.value })} placeholder="python" /></Field>
          </div>
          <Field label="参数" hint="用空格分隔"><Input className="w-full font-mono" value={form.args} onChange={(e) => setForm({ ...form, args: e.target.value })} placeholder="server.py --port 9000" /></Field>
          <Field label="描述"><Input className="w-full" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
          <Field label="环境变量" hint={editing ? "留空表示不修改；每行 KEY=VALUE" : "每行 KEY=VALUE"}>
            <Textarea className="w-full h-28 font-mono" value={form.env} onChange={(e) => setForm({ ...form, env: e.target.value })} placeholder={"API_KEY=...\nBASE_URL=..."} />
          </Field>
          <div className="text-[11px] text-slate-500">连接测试会以当前配置启动子进程并读取工具列表，超时 20 秒。该操作仅管理员可用。</div>
        </div>
      </Modal>

      <DetailDrawer
        open={!!detail}
        title={detail ? `MCP 服务 · ${detail.name}` : ""}
        onClose={() => setDetail(null)}
        fields={detail ? [
          { label: "状态", value: <Tag t={detail.status} /> },
          { label: "命令", value: <code>{[detail.command, ...detail.args].join(" ")}</code> },
          { label: "环境变量", value: detail.envKeys.join(", ") || "-" },
          { label: "工具数", value: String(detail.tools.length) },
        ] : []}
      >
        {detail && (
          <div className="space-y-2 text-xs">
            {detail.lastError && <div className="text-rose-600 break-all">{detail.lastError}</div>}
            {detail.tools.length === 0 && <div className="text-slate-500">尚未发现工具，请先执行连接测试。</div>}
            {detail.tools.map((tool) => (
              <div key={tool.name} className="border border-slate-100 rounded p-2">
                <div className="font-mono text-slate-800">{tool.name}</div>
                <div className="text-slate-500 mt-1">{tool.description || "无描述"}</div>
              </div>
            ))}
          </div>
        )}
      </DetailDrawer>
    </>
  );
}
