import { useState } from "react";
import { apiTestApi } from "@/api";
import type { ApiReport } from "@/api/types";
import { useAsync } from "@/hooks/useAsync";
import { useApp } from "@/store/app";
import { downloadText } from "@/lib/download";
import { Btn, Card, Progress, Stat, Table, Tag } from "@/components/ui";
import { DetailDrawer } from "@/components/business";

export function ApiReports() {
  const { data } = useAsync(() => apiTestApi.reports(), [], [] as ApiReport[]);
  const [detail, setDetail] = useState<ApiReport | null>(null);
  const { toast } = useApp();

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-4">
        <Stat label="报告总数" value={data.length} />
        <Stat label="最近通过率" value={data.length ? `${Math.round((data[0].passed / data[0].total) * 100)}%` : "-"} delta="1.2%" />
        <Stat label="失败用例" value={data.reduce((n, r) => n + (r.total - r.passed), 0)} />
        <Stat label="平均耗时" value="2m35s" />
      </div>

      <Card>
        <Table
          cols={["报告", "通过/总数", "耗时", "执行时间", "结果"]}
          rows={data.map((r) => [r.name, `${r.passed}/${r.total}`, r.duration, r.time, r.result])}
          actions={(i) => (
            <>
              <Btn v="ghost" onClick={() => setDetail(data[i])}>查看</Btn>
              <Btn v="ghost" onClick={() => { downloadText(`${data[i].name}.json`, JSON.stringify(data[i], null, 2), "application/json"); toast("报告已导出"); }}>导出</Btn>
            </>
          )}
        />
      </Card>

      <DetailDrawer
        open={!!detail}
        title={detail ? `执行报告 · ${detail.name}` : ""}
        onClose={() => setDetail(null)}
        fields={detail ? [
          { label: "通过 / 总数", value: `${detail.passed} / ${detail.total}` },
          { label: "耗时", value: detail.duration },
          { label: "执行时间", value: detail.time },
          { label: "结果", value: <Tag t={detail.result} /> },
        ] : []}
        footer={<Btn v="ghost" onClick={() => { if (detail) { downloadText(`${detail.name}.json`, JSON.stringify(detail, null, 2), "application/json"); toast("报告已导出"); } }}>导出报告</Btn>}
      >
        {detail && (
          <div className="space-y-4">
            <div>
              <div className="text-xs text-slate-500 mb-1">通过率</div>
              <Progress value={Math.round((detail.passed / detail.total) * 100)} />
              <div className="text-[11px] text-slate-500 mt-1">{detail.passed} 通过 · {detail.total - detail.passed} 失败</div>
            </div>
            <div>
              <div className="text-xs font-medium mb-2">失败明细</div>
              {detail.failures.length === 0 && <div className="text-xs text-slate-500">本次执行无失败用例</div>}
              {detail.failures.map((f) => (
                <div key={f.case} className="border border-rose-100 bg-rose-50/50 rounded p-2 mb-2 text-xs">
                  <div className="text-slate-800 font-medium">{f.case}</div>
                  <div className="text-rose-600 mt-1">{f.error}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </DetailDrawer>
    </div>
  );
}
