import { useState } from "react";
import { appAutoApi } from "@/api";
import type { Device } from "@/api/types";
import { useAsync } from "@/hooks/useAsync";
import { useApp } from "@/store/app";
import { Btn, Card, Stat, Tag } from "@/components/ui";

export function Devices() {
  const { data, setData } = useAsync(() => appAutoApi.devices(), [], [] as Device[]);
  const { toast, addTask } = useApp();
  const [busy, setBusy] = useState<string | null>(null);

  const toggle = async (id: string) => {
    setBusy(id);
    setData(await appAutoApi.toggleDevice(id));
    setBusy(null);
    toast("设备状态已更新");
  };

  const release = async (id: string) => {
    setData(await appAutoApi.releaseDevice(id));
    toast("设备已释放");
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-4">
        <Stat label="设备总数" value={data.length} />
        <Stat label="在线" value={data.filter((d) => d.status === "在线").length} delta="2" />
        <Stat label="执行中" value={data.filter((d) => d.occupancy === "执行中").length} />
        <Stat label="离线" value={data.filter((d) => d.status === "离线").length} up={false} delta="1" />
      </div>

      <div className="grid grid-cols-3 gap-4">
        {data.map((d) => (
          <Card key={d.id}>
            <div className="flex items-start justify-between">
              <div>
                <div className="text-sm font-semibold">{d.name}</div>
                <div className="text-[11px] text-slate-500 mt-0.5">{d.os} · {d.resolution}</div>
              </div>
              <Tag t={d.status} />
            </div>
            <div className="mt-3 flex items-center gap-2 text-xs">
              <span className="text-slate-500">占用</span>
              <Tag t={d.occupancy} c={d.occupancy === "执行中" ? "amber" : d.occupancy === "空闲" ? "green" : "gray"} />
            </div>
            <div className="flex gap-2 mt-4 pt-3 border-t border-slate-100">
              <Btn v="ghost" disabled={busy === d.id} onClick={() => toggle(d.id)}>{d.status === "在线" ? "下线" : "上线"}</Btn>
              <Btn v="ghost" disabled={d.occupancy !== "执行中"} onClick={() => release(d.id)}>释放</Btn>
              <Btn v="ghost" onClick={() => { addTask(`设备巡检 · ${d.name}`, "App"); toast("已触发设备巡检任务"); }}>巡检</Btn>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
