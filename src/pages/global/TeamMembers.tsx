import { useState } from "react";
import { teamApi } from "@/api";
import type { Member, RoleName } from "@/api/types";
import { useAsync } from "@/hooks/useAsync";
import { useApp } from "@/store/app";
import { confirmDelete } from "@/lib/confirm";
import { copyText } from "@/lib/copy";
import { ROLE_OPTIONS } from "@/config/constants";
import { Btn, Card, Field, Input, Modal, Select, Table, Toolbar } from "@/components/ui";

export function TeamMembers() {
  const { data, setData } = useAsync(() => teamApi.members(), [], [] as Member[]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ email: "", role: "开发者" as RoleName });
  const [inviteLink, setInviteLink] = useState("");
  const [query, setQuery] = useState("");
  const { toast } = useApp();

  const list = data.filter((m) => !query || m.name.includes(query) || m.email.includes(query));

  const invite = async () => {
    if (!form.email) { toast("请填写邮箱"); return; }
    try {
      const result = await teamApi.invite(form);
      setInviteLink(result.link);
      setOpen(false);
      setForm({ email: "", role: "开发者" });
      toast("邀请已创建，请把链接发给成员");
    } catch (err) {
      toast(err instanceof Error ? err.message : "邀请失败");
    }
  };

  const changeRole = async (id: string, role: string) => {
    setData(await teamApi.updateRole(id, role as RoleName));
    toast("角色已更新");
  };

  const remove = async (id: string) => {
    const target = data.find((x) => x.id === id);
    if (!confirmDelete(target?.name ?? id)) return;
    setData(await teamApi.removeMember(id));
    toast("成员已移除");
  };

  const copyInvite = async () => {
    toast((await copyText(inviteLink)) ? "邀请链接已复制到剪贴板" : "复制失败，请手动选择");
  };

  return (
    <Card>
      <Toolbar onSearch={setQuery} filters={<span />}>
        <Btn onClick={() => setOpen(true)}>+ 邀请成员</Btn>
      </Toolbar>
      <Table
        cols={["成员", "邮箱", "角色", "项目数", "状态"]}
        rows={list.map((m) => [
          m.name,
          m.email,
          <select key="role" value={m.role} onChange={(e) => changeRole(m.id, e.target.value)} className="h-7 px-1.5 rounded border border-slate-300 text-xs bg-white">
            {ROLE_OPTIONS.map((r) => <option key={r}>{r}</option>)}
          </select>,
          String(m.projectCount),
          m.status,
        ])}
        actions={(i) => <><Btn v="ghost" onClick={() => toast(`已向 ${list[i].email} 发送提醒`)}>提醒</Btn><Btn v="danger" onClick={() => remove(list[i].id)}>移除</Btn></>}
      />

      <Modal open={open} title="邀请成员" onClose={() => setOpen(false)} footer={<><Btn v="ghost" onClick={() => setOpen(false)}>取消</Btn><Btn onClick={invite}>生成邀请链接</Btn></>}>
        <div className="space-y-3">
          <Field label="邮箱"><Input className="w-full" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="name@corp.com" /></Field>
          <Field label="角色"><Select opts={ROLE_OPTIONS} className="w-full" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as RoleName })} /></Field>
          <div className="text-[11px] text-slate-500">平台采用邀请制。生成链接后发给成员，成员设置姓名和密码即可激活。</div>
        </div>
      </Modal>

      <Modal open={!!inviteLink} title="邀请链接" onClose={() => setInviteLink("")} footer={<><Btn v="ghost" onClick={() => setInviteLink("")}>关闭</Btn><Btn onClick={copyInvite}>复制链接</Btn></>}>
        <Input readOnly value={inviteLink} className="w-full font-mono text-[11px]" />
        <div className="text-[11px] text-slate-500 mt-2">链接 7 天内有效，成员激活后自动进入平台。</div>
      </Modal>
    </Card>
  );
}
