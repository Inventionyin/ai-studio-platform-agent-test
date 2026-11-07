import { useState } from "react";
import { appAutoApi } from "@/api";
import type { AppRun } from "@/api/types";
import { useAsync } from "@/hooks/useAsync";
import { useApp } from "@/store/app";
import { downloadText } from "@/lib/download";
import { Btn, Card, Stat, Table, Tag } from "@/components/ui";
import { DetailDrawer } from "@/components/business";

export function AppRuns() {
  const { data } = useAsync(() => appAutoApi.runs(), [], [] as AppRun[]);
  const [detail, setDetail] = useState<AppRun | null>(null);
  const { toast, addTask } = useApp();

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-4">
        <Stat label="执行总数" value={data.length} />
        <Stat label="成功" value={data.filter((r) => r.result === "成功").length} />
        <Stat label="失败" value={data.filter((r) => r.result === "失败").length} />
        <Stat label="平均耗时" value="1m20s" />
      </div>

      <Card title="App 执行记录" extra={<Btn v="ghost" onClick={() => { addTask("App 回归 · 全量", "App"); toast("已触发全量回归"); }}>触发回归</Btn>}>
        <Table
          cols={["流程", "设备", "结果", "执行时间", "耗时"]}
          rows={data.map((r) => [r.flow, r.device, r.result, r.time, r.duration])}
          actions={(i) => <Btn v="ghost" onClick={() => setDetail(data[i])}>详情</Btn>}
        />
      </Card>

      <DetailDrawer
        open={!!detail}
        title={detail ? `执行详情 · ${detail.flow}` : ""}
        onClose={() => setDetail(null)}
        fields={detail ? [
          { label: "设备", value: detail.device },
          { label: "结果", value: <Tag t={detail.result} /> },
          { label: "执行时间", value: detail.time },
          { label: "耗时", value: detail.duration },
        ] : []}
        footer={<Btn v="ghost" onClick={() => { if (detail) { downloadText(`${detail.id}.json`, JSON.stringify(detail, null, 2), "application/json"); toast("日志已导出"); } }}>导出日志</Btn>}
      >
        {detail && (
          <div className="space-y-2 text-xs">
            <div className="text-slate-500">执行步骤</div>
            {["启动 App", "图像识别：我的 Tab", "点击：我的", "断言：会员昵称可见"].map((s, i) => (
              <div key={s} className="flex items-center gap-2 border border-slate-100 rounded px-2 py-2">
                <span className="text-slate-500">{i + 1}</span>
                <span>{s}</span>
                <Tag t={detail.result === "成功" ? "成功" : i === 3 ? "失败" : "成功"} />
              </div>
            ))}
          </div>
        )}
      </DetailDrawer>
    </div>
  );
}
