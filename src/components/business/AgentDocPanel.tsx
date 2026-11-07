import { useEffect, useState } from "react";
import { agentTestApi } from "@/api";
import type { AgentDocContent, AgentDocMeta } from "@/api/types";
import { useAsync } from "@/hooks/useAsync";
import { Btn, Card, Empty } from "@/components/ui";
import { cx } from "@/lib/cx";
import { fmtTime } from "./agentTestUtils";

export function AgentDocPanel() {
  const { data: docs, loading, reload } = useAsync(() => agentTestApi.docs(), [], [] as AgentDocMeta[]);
  const [name, setName] = useState("");

  useEffect(() => {
    if (docs.length > 0 && !docs.some((item) => item.name === name)) setName(docs[0].name);
  }, [docs, name]);

  const { data: doc, loading: docLoading } = useAsync<AgentDocContent | null>(
    () => (name ? agentTestApi.doc(name) : Promise.resolve(null)),
    [name],
    null,
  );

  return (
    <div className="grid grid-cols-4 gap-4 items-start">
      <Card title="经验文档" className="col-span-1" extra={<Btn v="ghost" onClick={reload} disabled={loading}>{loading ? "刷新中…" : "刷新"}</Btn>}>
        {loading && docs.length === 0 ? (
          <Empty text="加载文档列表…" className="h-48" />
        ) : docs.length === 0 ? (
          <Empty text="暂无经验文档" className="h-48" />
        ) : (
          <div className="space-y-1">
            {docs.map((item) => (
              <button
                key={item.name}
                type="button"
                onClick={() => setName(item.name)}
                className={cx(
                  "w-full rounded-md px-2.5 py-2 text-left text-xs transition",
                  name === item.name ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-50",
                )}
              >
                <span className="block truncate font-medium" title={item.name}>{item.name}</span>
                <span className="mt-0.5 block text-[10px] text-slate-400">{fmtTime(item.updatedAt)} · {item.size} B</span>
              </button>
            ))}
          </div>
        )}
      </Card>

      <Card
        title={doc?.name ?? "文档内容"}
        className="col-span-3"
        extra={<span className="text-[11px] text-slate-500">{doc ? doc.name : "选择左侧文档"}</span>}
      >
        {!name ? (
          <Empty text="选择左侧文档查看内容" className="h-48" />
        ) : docLoading && !doc ? (
          <Empty text="加载文档内容…" className="h-48" />
        ) : !doc ? (
          <Empty text="文档不存在" className="h-48" />
        ) : (
          <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-words rounded-md bg-slate-900 p-3 text-[11px] leading-6 text-slate-100">
            {doc.content}
          </pre>
        )}
      </Card>
    </div>
  );
}
