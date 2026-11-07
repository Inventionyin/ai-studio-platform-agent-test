import { useState } from "react";
import { profileApi } from "@/api";
import { useApp } from "@/store/app";
import { Btn, Card, Field, Input, Switch, Table, Tag } from "@/components/ui";

const SESSIONS = [
  ["Chrome · macOS", "10.2.3.8", "当前会话", "今天 09:01"],
  ["Safari · iPhone", "10.2.3.19", "活跃", "今天 08:42"],
  ["Chrome · Windows", "10.2.5.66", "活跃", "昨天 21:10"],
];

export function ProfileSecurity() {
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [twoFactor, setTwoFactor] = useState(true);
  const [loginAlert, setLoginAlert] = useState(true);
  const [quotaAlert, setQuotaAlert] = useState(true);
  const { toast } = useApp();

  const submit = async () => {
    if (newPassword !== confirmPassword) { toast("两次输入的新密码不一致"); return; }
    try {
      await profileApi.changePassword(oldPassword, newPassword);
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast("密码已更新");
    } catch (e) {
      toast(e instanceof Error ? e.message : "修改失败");
    }
  };

  return (
    <div className="grid grid-cols-2 gap-4">
      <Card title="修改密码">
        <div className="space-y-3">
          <Field label="当前密码"><Input type="password" className="w-full" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} placeholder="至少 8 位" /></Field>
          <Field label="新密码" hint="需包含字母与数字"><Input type="password" className="w-full" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} /></Field>
          <Field label="确认新密码"><Input type="password" className="w-full" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} /></Field>
          <Btn onClick={submit}>更新密码</Btn>
        </div>
      </Card>

      <Card title="安全策略">
        <div className="flex items-center justify-between py-3 border-b border-slate-100">
          <div>
            <div className="text-xs font-medium">两步验证（TOTP）</div>
            <div className="text-[11px] text-slate-500 mt-1">登录时需输入动态验证码</div>
          </div>
          <Switch checked={twoFactor} onChange={(v) => { setTwoFactor(v); toast(v ? "已开启两步验证" : "已关闭两步验证"); }} label="两步验证" />
        </div>
        <div className="flex items-center justify-between py-3 border-b border-slate-100">
          <div>
            <div className="text-xs font-medium">登录邮件提醒</div>
            <div className="text-[11px] text-slate-500 mt-1">新设备登录时发送邮件</div>
          </div>
          <Switch checked={loginAlert} onChange={(v) => { setLoginAlert(v); toast(v ? "已开启登录提醒" : "已关闭登录提醒"); }} label="登录提醒" />
        </div>
        <div className="flex items-center justify-between py-3">
          <div>
            <div className="text-xs font-medium">Token 配额告警</div>
            <div className="text-[11px] text-slate-500 mt-1">使用量超过 80% 时通知</div>
          </div>
          <Switch checked={quotaAlert} onChange={(v) => { setQuotaAlert(v); toast(v ? "已开启配额告警" : "已关闭配额告警"); }} label="配额告警" />
        </div>
      </Card>

      <Card title="活跃会话" className="col-span-2" extra={<Btn v="danger" onClick={() => toast("已退出其他设备")}>退出其他设备</Btn>}>
        <Table cols={["设备", "IP", "状态", "最近活动"]} rows={SESSIONS.map(([d, ip, s, t]) => [d, ip, <Tag key="s" t={s} c={s === "当前会话" ? "blue" : "green"} />, t])} />
      </Card>
    </div>
  );
}
