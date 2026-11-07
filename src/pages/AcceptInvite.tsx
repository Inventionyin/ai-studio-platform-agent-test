import { useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { authApi } from "@/api/auth";
import { useAuth } from "@/store/auth";
import { Btn, Card, Field, Input } from "@/components/ui";

export function AcceptInvite() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const token = params.get("token") ?? "";
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (password !== confirm) {
      setError("两次输入的密码不一致");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await authApi.acceptInvite(token, name.trim(), password);
      await refresh();
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "激活失败");
    } finally {
      setBusy(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-slate-100 grid place-items-center p-6">
        <Card className="w-[400px] text-center"><div className="text-sm text-rose-600">邀请链接无效</div></Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
      <Card className="w-[400px]">
        <div className="text-base font-semibold mb-1">激活账号</div>
        <div className="text-[11px] text-slate-500 mb-5">设置你的姓名和密码，完成后自动登录。</div>
        <form onSubmit={submit} className="space-y-3">
          <Field label="姓名"><Input className="w-full" value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
          <Field label="密码" hint="至少 8 位"><Input type="password" className="w-full" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
          <Field label="确认密码"><Input type="password" className="w-full" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></Field>
          {error && <div className="text-xs text-rose-600">{error}</div>}
          <Btn type="submit" className="w-full" disabled={busy}>{busy ? "激活中…" : "激活并登录"}</Btn>
        </form>
      </Card>
    </div>
  );
}
