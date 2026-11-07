import { useState } from "react";
import { adminApi } from "@/api";
import type { PlatformUser } from "@/api/types";
import { useAsync } from "@/hooks/useAsync";
import { useApp } from "@/store/app";
import { downloadText } from "@/lib/download";
import { copyText } from "@/lib/copy";
import { Btn, Card, Field, Input, Modal, Select, Table, Toolbar } from "@/components/ui";

export function Users() {
  const { data, setData } = useAsync(() => adminApi.users(), [], [] as PlatformUser[]);
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("全部角色");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ email: "", role: "开发者" });
  const [inviteLink, setInviteLink] = useState("");
  const { toast } = useApp();

  const list = data.filter((u) => (role === "全部角色" || u.role === role) && (!query || u.name.includes(query) || u.dept.includes(query)));

  const create = async () => {
    if (!form.email.trim()) { toast("请输入邮箱"); return; }
    try {
      const result = await adminApi.addUser(form);
      setInviteLink(result.link);
      setOpen(false);
      setForm({ email: "", role: "开发者" });
      toast("邀请已创建");
    } catch (err) {
      toast(err instanceof Error ? err.message : "邀请失败");
    }
  };

  const toggle = async (id: string) => {
    setData(await adminApi.toggleUser(id));
    toast("用户状态已更新");
  };

  const exportList = () => {
    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const rows = list.map((u) => [u.name, u.dept, u.role, u.lastLogin, u.status].map(escape).join(","));
    downloadText("users.csv", "\uFEFF" + ["用户,部门,角色,最近登录,状态", ...rows].join("\n"), "text/csv;charset=utf-8");
    toast("已导出用户列表");
  };

  return (
    <>
      <Card>
        <Toolbar placeholder="搜索用户/部门" onSearch={setQuery} filters={<Select opts={["全部角色", "管理员", "开发者", "评审者", "只读"]} value={role} onChange={(e) => setRole(e.target.value)} />}>
          <Btn v="ghost" onClick={exportList}>导出</Btn>
          <Btn onClick={() => setOpen(true)}>+ 邀请用户</Btn>
        </Toolbar>
        <Table
          cols={["用户", "部门", "角色", "最近登录", "状态"]}
          rows={list.map((u) => [u.name, u.dept, u.role, u.lastLogin, u.status])}
          actions={(i) => (
            <Btn v="danger" onClick={() => toggle(list[i].id)}>{list[i].status === "启用" ? "停用" : "启用"}</Btn>
          )}
        />
      </Card>

      <Modal open={open} title="邀请平台用户" onClose={() => setOpen(false)} footer={<><Btn v="ghost" onClick={() => setOpen(false)}>取消</Btn><Btn onClick={create}>生成邀请链接</Btn></>}>
        <div className="space-y-3">
          <Field label="邮箱"><Input className="w-full" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoFocus placeholder="name@corp.com" /></Field>
          <Field label="角色"><Select opts={["管理员", "开发者", "评审者", "只读"]} className="w-full" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} /></Field>
          <div className="text-[11px] text-slate-500">邀请链接 7 天内有效，成员激活后出现在用户列表。</div>
        </div>
      </Modal>

      <Modal open={!!inviteLink} title="邀请链接" onClose={() => setInviteLink("")} footer={<><Btn v="ghost" onClick={() => setInviteLink("")}>关闭</Btn><Btn onClick={async () => toast((await copyText(inviteLink)) ? "已复制邀请链接" : "复制失败")}>复制链接</Btn></>}>
        <Input readOnly value={inviteLink} className="w-full font-mono text-[11px]" />
      </Modal>
    </>
  );
}
