import { useNavigate } from "react-router-dom";
import { dashboardApi } from "@/api";
import type { DashboardData } from "@/api/types";
import { useAsync } from "@/hooks/useAsync";
import { useApp } from "@/store/app";
import { Bars, Btn, Card, Select, Stat, Tag } from "@/components/ui";

export function Dashboard() {
  const { data } = useAsync<DashboardData | null>(() => dashboardApi.get(), [], null);
  const navigate = useNavigate();
  const { projectId } = useApp();

  if (!data) return <div className="h-40 grid place-items-center text-xs text-slate-500">加载中…</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between bg-gradient-to-r from-blue-600 to-indigo-600 rounded-lg p-5 text-white">
        <div>
          <div className="text-lg font-semibold">早上好，张伟</div>
          <div className="text-xs text-blue-100 mt-1">你有 5 项待办、2 个生成任务正在运行</div>
        </div>
        <div className="flex gap-2">
          <Btn v="ghost" onClick={() => navigate(`/project/${projectId}/requirements`)}>+ 新建需求</Btn>
          <Btn v="ghost" onClick={() => navigate(`/project/${projectId}/testcases/generate`)}>+ 新建生成任务</Btn>
          <Btn v="ghost" onClick={() => navigate(`/project/${projectId}/ai/workflow`)}>+ 新建工作流</Btn>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {data.stats.map((s) => <Stat key={s.label} label={s.label} value={s.value} delta={s.delta} up={s.up} />)}
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card title="Token 与算力消耗趋势" className="col-span-2" extra={<Select opts={["近 7 天", "近 30 天"]} />}>
          <Bars data={data.tokenTrend} />
        </Card>
        <Card title="告警提示">
          {data.alerts.map((a) => (
            <div key={a.text} className="flex gap-2 items-start py-2 border-b last:border-0 text-xs">
              <Tag t={a.level} />
              <span>{a.text}</span>
            </div>
          ))}
        </Card>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card title="我的项目">
          {data.projects.map((p) => (
            <button key={p.id} onClick={() => navigate(`/project/${p.id}/overview`)} className="w-full flex justify-between py-2 border-b last:border-0 text-xs hover:text-blue-600">
              <span>{p.name}</span>
              <span className="text-slate-500">{p.caseCount} 用例</span>
            </button>
          ))}
        </Card>
        <Card title="待办任务">
          {data.todos.map((t) => (
            <label key={t} className="flex gap-2 py-2 border-b last:border-0 text-xs"><input type="checkbox" />{t}</label>
          ))}
        </Card>
        <Card title="近期动态">
          {data.activities.map((a) => (
            <div key={a.action} className="py-2 border-b last:border-0 text-xs">
              <b>{a.user}</b> {a.action}
              <div className="text-slate-500 text-[11px]">{a.time}</div>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}
