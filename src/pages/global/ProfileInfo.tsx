import { useEffect, useState } from "react";
import { profileApi } from "@/api";
import type { UserProfile } from "@/api/types";
import { useAsync } from "@/hooks/useAsync";
import { useApp } from "@/store/app";
import { Btn, Card, Field, Input, Tag, Textarea } from "@/components/ui";

export function ProfileInfo() {
  const { data, setData } = useAsync(() => profileApi.get(), [], null as UserProfile | null);
  const [form, setForm] = useState<UserProfile | null>(null);
  const { toast } = useApp();

  useEffect(() => { if (data) setForm(data); }, [data]);

  if (!form) return <div className="h-40 grid place-items-center text-xs text-slate-500">加载中…</div>;

  const save = async () => {
    const next = await profileApi.update(form);
    setData(next);
    setForm(next);
    toast("个人信息已保存");
  };

  return (
    <div className="grid grid-cols-3 gap-4">
      <Card title="账号概览">
        <div className="flex flex-col items-center py-4">
          <div className="w-16 h-16 rounded-full bg-blue-500 text-white grid place-items-center text-xl">{form.name.slice(0, 1)}</div>
          <div className="mt-3 text-sm font-semibold">{form.name}</div>
          <div className="text-xs text-slate-500 mt-1">{form.email}</div>
          <div className="mt-2 flex gap-2"><Tag t={form.role} c="blue" /><Tag t={form.dept} c="gray" /></div>
        </div>
        <div className="border-t border-slate-100 pt-3 text-xs space-y-2">
          <div className="flex justify-between"><span className="text-slate-500">账号 ID</span><span>{form.id}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">最近登录</span><span>今天 09:01 · 10.2.3.8</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Token 配额</span><span>12.8M / 15M</span></div>
        </div>
      </Card>

      <Card title="基本信息" className="col-span-2" extra={<Btn onClick={save}>保存修改</Btn>}>
        <div className="grid grid-cols-2 gap-4">
          <Field label="姓名"><Input className="w-full" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="邮箱"><Input className="w-full" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="手机号"><Input className="w-full" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
          <Field label="职位"><Input className="w-full" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
          <Field label="部门"><Input className="w-full" value={form.dept} onChange={(e) => setForm({ ...form, dept: e.target.value })} /></Field>
          <Field label="团队角色"><Input className="w-full" value={form.role} readOnly /></Field>
          <Field label="个人简介" className="col-span-2"><Textarea className="w-full h-24" value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} /></Field>
        </div>
      </Card>
    </div>
  );
}
