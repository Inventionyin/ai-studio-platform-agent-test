import { useState } from "react";
import { knowledgeApi } from "@/api";
import type { RecallHit } from "@/api/types";
import { useApp } from "@/store/app";
import { Btn, Card, Field, Input, Select, Switch, Tag } from "@/components/ui";

export function Recall() {
  const [q, setQ] = useState("优惠券叠加规则");
  const [method, setMethod] = useState("混合检索");
  const [topK, setTopK] = useState("5");
  const [rerank, setRerank] = useState(true);
  const [hits, setHits] = useState<RecallHit[]>([]);
  const [busy, setBusy] = useState(false);
  const { toast } = useApp();

  const test = async () => {
    if (!q.trim()) { toast("请输入查询内容"); return; }
    setBusy(true);
    setHits(await knowledgeApi.recall(q, Number(topK) || 5));
    setBusy(false);
    toast(`召回 ${Number(topK) || 5} 条结果`);
  };

  return (
    <div className="grid grid-cols-3 gap-4">
      <Card title="召回参数">
        <div className="space-y-3 text-xs">
          <Field label="查询内容"><Input value={q} onChange={(e) => setQ(e.target.value)} className="w-full" /></Field>
          <Field label="检索方式"><Select opts={["混合检索", "向量检索", "全文检索"]} className="w-full" value={method} onChange={(e) => setMethod(e.target.value)} /></Field>
          <Field label="Top K"><Input value={topK} onChange={(e) => setTopK(e.target.value)} className="w-full" /></Field>
          <div className="flex items-center justify-between">
            <span className="text-slate-600">Rerank 重排序</span>
            <Switch checked={rerank} onChange={setRerank} label="重排序" />
          </div>
          <Btn onClick={test} disabled={busy} className="w-full">{busy ? "检索中…" : "测试召回"}</Btn>
          <div className="text-[11px] text-slate-500 leading-relaxed">混合检索会合并向量与全文结果，Rerank 后返回 Top N。</div>
        </div>
      </Card>

      <Card title={`召回结果${hits.length ? `（${hits.length}）` : ""}`} className="col-span-2">
        {hits.length === 0 ? (
          <div className="h-48 grid place-items-center text-xs text-slate-500">输入查询后点击测试</div>
        ) : (
          hits.map((h) => (
            <div key={`${h.doc}-${h.chunkIndex}`} className="border rounded-md p-3 mb-2 text-xs">
              <div className="flex justify-between mb-1">
                <span className="text-slate-500">{h.doc} · 段落 {h.chunkIndex}</span>
                <Tag t={`相似度 ${h.score.toFixed(2)}`} c="blue" />
              </div>
              <div className="text-slate-700 leading-relaxed">{h.content}</div>
            </div>
          ))
        )}
      </Card>
    </div>
  );
}
