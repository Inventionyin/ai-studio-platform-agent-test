import { useState } from "react";
import { adminApi } from "@/api";
import type { AuditLog } from "@/api/types";
import { useAsync } from "@/hooks/useAsync";
import { Btn, Card, Select, Table, Toolbar } from "@/components/ui";
import { DetailDrawer } from "@/components/business";

export function AuditLogPage() {
  const { data } = useAsync(() => adminApi.audits(), [], [] as AuditLog[]);
  const [query, setQuery] = useState("");
  const [operator, setOperator] = useState("全部操作人");
  const [detail, setDetail] = useState<AuditLog | null>(null);

  const operators = ["全部操作人", ...Array.from(new Set(data.map((a) => a.operator)))];
  const list = data.filter((a) => (operator === "全部操作人" || a.operator === operator) && (!query || a.action.includes(query) || a.target.includes(query)));

  return (
    <>
      <Card>
        <Toolbar placeholder="搜索动作/对象" onSearch={setQuery} filters={<Select opts={operators} value={operator} onChange={(e) => setOperator(e.target.value)} />}>
          <Btn v="ghost" onClick={() => setQuery("")}>重置筛选</Btn>
        </Toolbar>
        <Table
          cols={["时间", "操作人", "动作", "对象", "Token", "IP"]}
          rows={list.map((a) => [a.time, a.operator, a.action, a.target, a.tokens, a.ip])}
          actions={(i) => <Btn v="ghost" onClick={() => setDetail(list[i])}>详情</Btn>}
        />
      </Card>

      <DetailDrawer
        open={!!detail}
        title={detail ? `审计详情 · ${detail.action}` : ""}
        onClose={() => setDetail(null)}
        fields={detail ? [
          { label: "时间", value: detail.time },
          { label: "操作人", value: detail.operator },
          { label: "动作", value: detail.action },
          { label: "对象", value: detail.target },
          { label: "Token 消耗", value: detail.tokens },
          { label: "来源 IP", value: detail.ip },
        ] : []}
      >
        {detail && (
          <div>
            <div className="text-xs text-slate-500 mb-2">扩展信息</div>
            <pre className="bg-slate-900 text-emerald-300 rounded-md p-3 text-[11px] overflow-x-auto">{JSON.stringify(detail.detail, null, 2)}</pre>
          </div>
        )}
      </DetailDrawer>
    </>
  );
}
