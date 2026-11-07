import { useNavigate } from "react-router-dom";
import { useApp, useTasks } from "@/store/app";
import { cx } from "@/lib/cx";

export function TaskDock() {
  const { dockOpen, setDockOpen, projectId } = useApp();
  const tasks = useTasks();
  const navigate = useNavigate();
  const running = tasks.filter((t) => t.status === "进行中").length;

  return (
    <div className="fixed right-5 bottom-5 w-72 bg-white rounded-lg shadow-2xl border border-slate-200 z-40">
      <button onClick={() => setDockOpen(!dockOpen)} className="w-full flex justify-between items-center px-4 h-10 text-xs font-medium border-b">
        后台任务 <span className="text-blue-600">{running} 个进行中 {dockOpen ? "▾" : "▴"}</span>
      </button>
      {dockOpen && (
        <div className="max-h-56 overflow-y-auto">
          {tasks.length === 0 && <div className="px-4 py-6 text-center text-xs text-slate-500">暂无后台任务</div>}
          {tasks.map((t) => (
            <div key={t.id} className="px-4 py-2.5 border-b last:border-0 text-xs">
              <div className="flex justify-between gap-2">
                <span className="truncate">{t.name}</span>
                <span className={cx(t.status === "已完成" ? "text-emerald-600" : t.status === "失败" ? "text-rose-600" : "text-slate-500")}>
                  {t.status === "进行中" ? `${t.progress}%` : t.status}
                </span>
              </div>
              <div className="h-1 bg-slate-100 rounded mt-1.5">
                <div className={cx("h-1 rounded transition-all", t.status === "已完成" ? "bg-emerald-500" : t.status === "失败" ? "bg-rose-500" : "bg-blue-500")} style={{ width: `${t.progress}%` }} />
              </div>
            </div>
          ))}
          <button onClick={() => navigate(`/project/${projectId}/tasks`)} className="w-full text-center text-xs text-blue-600 py-2">查看全部任务</button>
        </div>
      )}
    </div>
  );
}
