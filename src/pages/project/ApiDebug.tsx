import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { apiTestApi } from "@/api";
import type { ApiResponse, Assertion } from "@/api/types";
import { useApp } from "@/store/app";
import { Btn, Card, Input, Select, Table, Tag, Textarea } from "@/components/ui";
import { cx } from "@/lib/cx";

const TABS = ["Params", "Headers", "Body", "前置脚本", "后置脚本", "断言"];
const ASSERTIONS: Assertion[] = [
  { type: "状态码", expression: "-", expected: "200" },
  { type: "JSONPath", expression: "$.code", expected: "0" },
  { type: "响应时间", expression: "-", expected: "< 500ms" },
];

export function ApiDebug() {
  const [params] = useSearchParams();
  const initialPath = params.get("path") ?? "/api/v1/member/benefits/1/claim";
  const initialMethod = params.get("method") ?? "POST";
  const [method, setMethod] = useState(initialMethod);
  const [url, setUrl] = useState(`{{base_url}}${initialPath}`);
  const [env, setEnv] = useState("测试环境");
  const [tab, setTab] = useState("Body");
  const [res, setRes] = useState<ApiResponse | null>(null);
  const [sending, setSending] = useState(false);
  const { toast } = useApp();

  const send = async () => {
    setSending(true);
    setRes(null);
    try {
      const response = await apiTestApi.send({ method: method as "GET" | "POST" | "PUT" | "DELETE" | "PATCH", url, body: "{}", assertions: ASSERTIONS });
      setRes(response);
      toast("请求完成，断言全部通过");
    } finally {
      setSending(false);
    }
  };

  const saveCase = async () => {
    const path = url.replace("{{base_url}}", "");
    await apiTestApi.create({ method: method as "GET" | "POST" | "PUT" | "DELETE" | "PATCH", path, name: "调试保存的接口", module: "调试" });
    toast("已保存为接口用例");
  };

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex gap-2">
          <Select opts={["POST", "GET", "PUT", "DELETE"]} value={method} onChange={(e) => setMethod(e.target.value)} />
          <Input defaultValue={url} className="flex-1 font-mono" onChange={(e) => setUrl(e.target.value)} />
          <Select opts={["测试环境", "预发环境", "生产只读"]} value={env} onChange={(e) => setEnv(e.target.value)} />
          <Btn onClick={send} disabled={sending}>{sending ? "发送中…" : "发送"}</Btn>
          <Btn v="ghost" onClick={saveCase}>保存为用例</Btn>
        </div>
        <div className="flex gap-4 mt-3 border-b">
          {TABS.map((t) => (
            <button key={t} onClick={() => setTab(t)} className={cx("pb-2 text-xs border-b-2", tab === t ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500")}>{t}</button>
          ))}
        </div>
        {tab === "断言" ? (
          <div className="mt-3">
            <Table cols={["类型", "表达式", "期望"]} rows={ASSERTIONS.map((item) => [item.type, item.expression, item.expected])} />
          </div>
        ) : tab === "Params" ? (
          <div className="mt-3"><Table cols={["参数", "值", "说明"]} rows={[["id", "1", "权益 ID"], ["locale", "zh-CN", "语言"]]} /></div>
        ) : (
          <Textarea
            className="w-full h-28 font-mono text-xs mt-3"
            spellCheck={false}
            defaultValue={tab === "Body" ? '{\n  "userId": "{{user_id}}"\n}' : tab === "Headers" ? '{\n  "Authorization": "Bearer {{token}}"\n}' : "# 脚本在请求前后执行"}
          />
        )}
      </Card>

      {res && (
        <Card title="响应" extra={<div className="flex gap-3 items-center text-xs"><Tag t={`${res.status} ${res.statusText}`} c="green" /><span>{res.timeMs}ms</span><span>{res.sizeKb}KB</span><span className="text-emerald-600">断言 {res.assertionsPassed}/{res.assertionsTotal} 通过</span></div>}>
          <pre className="bg-slate-900 text-emerald-300 rounded-md p-3 text-xs overflow-x-auto">{res.body}</pre>
        </Card>
      )}
    </div>
  );
}
