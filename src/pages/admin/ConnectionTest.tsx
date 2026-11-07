import { useState } from "react";
import { adminApi } from "@/api";
import type { ModelProvider } from "@/api/types";
import { useAsync } from "@/hooks/useAsync";
import { useApp } from "@/store/app";
import { Btn, Card, Progress, Table, Tag } from "@/components/ui";

export function ConnectionTest() {
  const { data, setData } = useAsync(() => adminApi.providers(), [], [] as ModelProvider[]);
  const [busy, setBusy] = useState<string | null>(null);
  const [allBusy, setAllBusy] = useState(false);
  const { toast } = useApp();

  const testOne = async (id: string) => {
    setBusy(id);
    setData(await adminApi.testProvider(id));
    setBusy(null);
  };

  const testAll = async () => {
    setAllBusy(true);
    for (const p of data) {
      setBusy(p.id);
      const updated = await adminApi.testProvider(p.id);
      setData(updated);
    }
    setBusy(null);
    setAllBusy(false);
    toast("全部供应商连接测试完成");
  };

  const normal = data.filter((p) => p.status === "正常").length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <Card><div className="text-xs text-slate-500">供应商总数</div><div className="text-2xl font-semibold mt-1">{data.length}</div></Card>
        <Card><div className="text-xs text-slate-500">连通正常</div><div className="text-2xl font-semibold mt-1 text-emerald-600">{normal}</div></Card>
        <Card><div className="text-xs text-slate-500">平均延迟</div><div className="text-2xl font-semibold mt-1">{normal ? Math.round(data.filter((p) => p.latencyMs > 0).reduce((n, p) => n + p.latencyMs, 0) / normal) : 0}ms</div></Card>
      </div>

      <Card title="连接测试" extra={<Btn onClick={testAll} disabled={allBusy}>{allBusy ? "检测中…" : "全部检测"}</Btn>}>
        <Table
          cols={["供应商", "Base URL", "状态", "延迟", "可用模型"]}
          rows={data.map((p) => [
            p.name,
            <code key="u" className="text-[11px]">{p.baseUrl}</code>,
            p.status,
            p.latencyMs > 0 ? <div key="l" className="w-28"><Progress value={Math.min(100, p.latencyMs / 8)} /><span className="text-[10px] text-slate-500">{p.latencyMs}ms</span></div> : "-",
            p.models,
          ])}
          actions={(i) => <Btn v="ghost" disabled={busy === data[i].id} onClick={() => testOne(data[i].id)}>{busy === data[i].id ? "检测中…" : "测试"}</Btn>}
        />
      </Card>

      <Card title="检测日志">
        <div className="space-y-1 text-[11px] font-mono text-slate-600">
          {data.map((p) => (
            <div key={p.id} className="flex gap-2">
              <span className="text-slate-500">{new Date().toLocaleTimeString("zh-CN", { hour12: false })}</span>
              <Tag t={p.status} />
              <span>{p.name}</span>
              <span className="text-slate-500">{p.status === "正常" ? `GET /v1/models → 200 (${p.latencyMs}ms)` : "GET /v1/models → 401 Unauthorized"}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
