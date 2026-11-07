import { projectsApi, tasksApi } from "@/api";
import type { Project } from "@/api/types";
import { useAsync } from "@/hooks/useAsync";
import { useApp } from "@/store/app";
import { Bars, Card, Stat, Table } from "@/components/ui";

export function Overview() {
  const { projectId } = useApp();
  const { data: project } = useAsync<Project | null>(() => projectsApi.get(projectId).then((p) => p ?? null), [projectId], null);
  const { data: tasks } = useAsync(() => tasksApi.history(), [], []);

  if (!project) return <div className="h-40 grid place-items-center text-xs text-slate-500">加载中…</div>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-5 gap-4">
        <Stat label="需求数" value={project.requirementCount} delta="4" />
        <Stat label="用例数" value={project.caseCount} delta="86" />
        <Stat label="接口数" value={project.apiCount} />
        <Stat label="生成任务" value={project.taskCount} />
        <Stat label="测试通过率" value={`${project.passRate}%`} delta="1.2%" />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card title="近 7 日执行通过率" className="col-span-2">
          <Bars data={[82, 88, 76, 91, 85, 94, 90]} color="bg-emerald-500" />
        </Card>
        <Card title="用例分布">
          {[["API", 58, "bg-blue-500"], ["WebUI", 24, "bg-indigo-500"], ["App", 12, "bg-violet-500"], ["手工", 6, "bg-slate-400"]].map(([l, v, c]) => (
            <div key={l as string} className="mb-3 text-xs">
              <div className="flex justify-between mb-1"><span>{l}</span><span>{v}%</span></div>
              <div className="h-2 bg-slate-100 rounded"><div className={`h-2 rounded ${c}`} style={{ width: `${v}%` }} /></div>
            </div>
          ))}
        </Card>
      </div>

      <Card title="最近活动">
        <Table cols={["时间", "成员", "动作", "对象", "状态"]} rows={[["10:24", "李娜", "生成原型图", "REQ-021 会员中心", "已完成"], ["09:58", "王磊", "执行套件", "支付回调回归", "失败"], ["09:12", "赵敏", "评审用例", "登录模块", "通过"]]} />
      </Card>

      <Card title="项目成员">
        <div className="flex gap-3 flex-wrap">
          {project.members.map((m) => (
            <div key={m.userId} className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-md text-xs">
              <div className="w-6 h-6 rounded-full bg-blue-500 text-white grid place-items-center text-[10px]">{m.name.slice(0, 1)}</div>
              {m.name}
              <span className="text-slate-500">{m.role}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card title="最近任务">
        <Table cols={["任务", "类型", "触发人", "进度", "状态"]} rows={tasks.slice(0, 3).map((t) => [t.name, t.type, t.trigger, `${t.progress}%`, t.status])} />
      </Card>
    </div>
  );
}
