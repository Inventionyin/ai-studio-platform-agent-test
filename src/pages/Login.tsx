import { useEffect, useState, type FormEvent } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { authApi, type OAuthProvider } from "@/api/auth";
import { useAuth } from "@/store/auth";
import { Card, Btn, Field, Input } from "@/components/ui";

export function Login() {
  const { user, login } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [providers, setProviders] = useState<OAuthProvider[]>([]);

  useEffect(() => {
    void authApi.oauthProviders().then(setProviders).catch(() => setProviders([]));
  }, []);

  if (user) return <Navigate to={params.get("next") || "/dashboard"} replace />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await login(email.trim(), password);
      navigate(params.get("next") || "/dashboard", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
      <Card className="w-[400px]">
        <div className="flex items-center gap-2 mb-6">
          <div className="w-8 h-8 rounded bg-blue-600 text-white grid place-items-center text-sm font-semibold">AI</div>
          <div>
            <div className="text-base font-semibold">AI 测试开发平台</div>
            <div className="text-[11px] text-slate-500">登录后访问项目空间</div>
          </div>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <Field label="邮箱"><Input type="email" className="w-full" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus autoComplete="username" /></Field>
          <Field label="密码"><Input type="password" className="w-full" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></Field>
          {error && <div className="text-xs text-rose-600">{error}</div>}
          <Btn type="submit" className="w-full" disabled={busy}>{busy ? "登录中…" : "登录"}</Btn>
        </form>
        {providers.length > 0 && (
          <div className="mt-4 pt-4 border-t border-slate-100">
            <div className="text-[11px] text-slate-500 mb-2">企业单点登录</div>
            <div className="flex gap-2">
              {providers.map((provider) => (
                <Btn key={provider.id} v="ghost" onClick={() => { window.location.href = authApi.oauthUrl(provider.id); }}>
                  {provider.name}
                </Btn>
              ))}
            </div>
          </div>
        )}
        <div className="mt-5 text-[11px] text-slate-500 leading-relaxed">
          平台采用邀请制。没有账号请联系管理员发送邀请链接。
        </div>
      </Card>
    </div>
  );
}
