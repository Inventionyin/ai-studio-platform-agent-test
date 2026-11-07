import { useState } from "react";
import { webuiApi } from "@/api";
import type { UiRun } from "@/api/types";
import { useAsync } from "@/hooks/useAsync";
import { Btn, Card, Stat, Table, Tag } from "@/components/ui";
import { DetailDrawer } from "@/components/business";

export function UiRuns() {
  const { data } = useAsync(() => webuiApi.runs(), [], [] as UiRun[]);
  const [detail, setDetail] = useState<UiRun | null>(null);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-4">
        <Stat label="执行总数" value={data.length} />
        <Stat label="成功" value={data.filter((r) => r.result === "成功").length} />
        <Stat label="失败" value={data.filter((r) => r.result === "失败").length} />
        <Stat label="平均耗时" value="40s" />
      </div>
      <Card title="执行记录">
        <Table
          cols={["脚本", "浏览器", "结果", "截图/视频", "执行时间", "耗时"]}
          rows={data.map((r) => [r.script, r.browser, r.result, `${r.shots} 张 / ${r.video ? "1 段" : "无"}`, r.time, r.duration])}
          actions={(i) => <Btn v="ghost" onClick={() => setDetail(data[i])}>详情</Btn>}
        />
      </Card>

      <DetailDrawer
        open={!!detail}
        title={detail ? `执行详情 · ${detail.script}` : ""}
        onClose={() => setDetail(null)}
        fields={detail ? [
          { label: "浏览器", value: detail.browser },
          { label: "结果", value: <Tag t={detail.result} /> },
          { label: "执行时间", value: detail.time },
          { label: "耗时", value: detail.duration },
        ] : []}
      >
        {detail && (
          <div className="space-y-4 text-xs">
            <div>
              <div className="text-slate-500 mb-2">步骤截图</div>
              <div className="grid grid-cols-2 gap-2">
                {Array.from({ length: detail.shots }).map((_, i) => (
                  <div key={i} className="aspect-video bg-slate-100 border border-slate-200 rounded grid place-items-center text-[11px] text-slate-500">
                    步骤 {i + 1} 截图
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="text-slate-500 mb-2">执行视频</div>
              {detail.video ? (
                <div className="aspect-video bg-slate-900 rounded grid place-items-center text-[11px] text-slate-300">录制视频 · {detail.duration}</div>
              ) : (
                <div className="text-slate-500">本次执行未录制视频</div>
              )}
            </div>
          </div>
        )}
      </DetailDrawer>
    </div>
  );
}
