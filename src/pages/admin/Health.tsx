import { useState } from "react";
import { adminApi } from "@/api";
import type { HealthService } from "@/api/types";
import { useAsync } from "@/hooks/useAsync";
import { useApp } from "@/store/app";
import { Btn, Card, Tag } from "@/components/ui";

export function Health() {
  const { data, setData } = useAsync(() => adminApi.health(), [], [] as HealthService[]);
  const [busy, setBusy] = useState(false);
  const { toast } = useApp();

  const check = async () => {
    setBusy(true);
    setData(await adminApi.checkHealth());
    setBusy(false);
    toast("环境检测完成");
  };

  const normal = data.filter((h) => h.status === "正常").length;
  const warn = data.filter((h) => h.status !== "正常").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="text-xs text-slate-500">共 {data.length} 项依赖服务，{normal} 项正常，{warn} 项异常或告警。</div>
        <div className="flex-1" />
        <Btn onClick={check} disabled={busy}>{busy ? "检测中…" : "重新检测"}</Btn>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {data.map((h) => (
          <Card key={h.name}>
            <div className="flex justify-between items-start">
              <span className="text-xs font-medium">{h.name}</span>
              <Tag t={h.status} />
            </div>
            <div className="text-xl font-semibold mt-2">{h.metric}</div>
            <div className="text-[11px] text-slate-500 mt-1 leading-relaxed">{h.detail}</div>
          </Card>
        ))}
      </div>

      <Card title="依赖服务说明">
        <div className="text-xs text-slate-600 space-y-1.5">
          <div>PostgreSQL / Redis / MinIO 为主库、缓存与对象存储；异常会阻断生成任务与报告下载。</div>
          <div>Celery Worker 数量决定并发生成能力；积压超过 50 会触发平台告警。</div>
          <div>Playwright 节点与设备池仅影响自动化执行，不影响 AI 生成链路。</div>
        </div>
      </Card>
    </div>
  );
}
