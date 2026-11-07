import { useState } from "react";
import { adminApi } from "@/api";
import type { NotificationChannel } from "@/api/types";
import { useAsync } from "@/hooks/useAsync";
import { useApp } from "@/store/app";
import { Btn, Card, Field, Input, Modal, Select, Switch, Table, Toolbar } from "@/components/ui";

const EMPTY = { name: "", type: "飞书 Webhook", event: "任务失败", target: "" };

export function Notifications() {
  const { data, setData } = useAsync(() => adminApi.channels(), [], [] as NotificationChannel[]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [query, setQuery] = useState("");
  const [type, setType] = useState("全部类型");
  const [globalOn, setGlobalOn] = useState(true);
  const { toast } = useApp();

  const list = data.filter((c) => (type === "全部类型" || c.type === type) && (!query || c.name.includes(query) || c.event.includes(query)));

  const create = async () => {
    if (!form.name.trim() || !form.target.trim()) { toast("请填写名称与接收地址"); return; }
    setData(await adminApi.addChannel(form));
    setOpen(false);
    setForm(EMPTY);
    toast("通知渠道已添加");
  };

  const toggle = async (id: string) => {
    setData(await adminApi.toggleChannel(id));
    toast("渠道状态已更新");
  };

  return (
    <>
      <Card>
        <Toolbar placeholder="搜索渠道/事件" onSearch={setQuery} filters={<Select opts={["全部类型", "飞书 Webhook", "邮件", "企业微信"]} value={type} onChange={(e) => setType(e.target.value)} />}>
          <Btn onClick={() => setOpen(true)}>+ 添加渠道</Btn>
        </Toolbar>
        <Table
          cols={["渠道", "类型", "触发事件", "接收地址", "状态"]}
          rows={list.map((c) => [c.name, c.type, c.event, <code key="t" className="text-[11px]">{c.target}</code>, c.status])}
          actions={(i) => (
            <>
              <Btn v="ghost" onClick={() => toast(`已向「${list[i].name}」发送测试消息`)}>发送测试</Btn>
              <Btn v="danger" onClick={() => toggle(list[i].id)}>{list[i].status === "启用" ? "停用" : "启用"}</Btn>
            </>
          )}
        />
        <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
          <Switch checked={globalOn} onChange={(v) => { setGlobalOn(v); toast(v ? "已开启全局通知" : "已关闭全局通知"); }} label="全局通知" />
          全局通知开关（关闭后所有渠道静默）
        </div>
      </Card>

      <Modal open={open} title="添加通知渠道" onClose={() => setOpen(false)} footer={<><Btn v="ghost" onClick={() => setOpen(false)}>取消</Btn><Btn onClick={create}>保存</Btn></>}>
        <div className="space-y-3">
          <Field label="渠道名称"><Input className="w-full" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="类型"><Select opts={["飞书 Webhook", "邮件", "企业微信"]} className="w-full" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} /></Field>
            <Field label="触发事件"><Select opts={["任务失败", "日报", "Token 告警", "评审邀请"]} className="w-full" value={form.event} onChange={(e) => setForm({ ...form, event: e.target.value })} /></Field>
          </div>
          <Field label="接收地址" hint="Webhook URL 或邮箱地址"><Input className="w-full font-mono" value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} /></Field>
        </div>
      </Modal>
    </>
  );
}
