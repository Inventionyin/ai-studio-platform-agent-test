import { useState } from "react";
import { tasksApi } from "@/api";
import type { Task } from "@/api/types";
import { useAsync } from "@/hooks/useAsync";
import { useApp, useTasks } from "@/store/app";
import { confirmDelete } from "@/lib/confirm";
import { downloadText } from "@/lib/download";
import { Btn, Card, Progress, Stat, Table, Toolbar } from "@/components/ui";
import { DetailDrawer } from "@/components/business";

export function TaskList() {
  const { data: history } = useAsync(() => tasksApi.history(), [], [] as Task[]);
  const { retryTask, removeTask, clearCompleted, addTask, toast } = useApp();
  const tasks = useTasks();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("全部状态");
  const [detail, setDetail] = useState<Task | null>(null);

  const runtimeIds = new Set(tasks.map((t) => t.id));
  const all = [...tasks, ...history];
  const list = all.filter((t) => (status === "全部状态" || t.status === status) && (!query || t.name.includes(query) || t.type.includes(query)));

  const retry = (task: Task) => {
    if (runtimeIds.has(task.id)) retryTask(task.id);
    else addTask(task.name, task.type);
    toast("任务已重新提交");
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-4">
        <Stat label="任务总数" value={all.length} />
        <Stat label="进行中" value={all.filter((t) => t.status === "进行中").length} />
        <Stat label="已完成" value={all.filter((t) => t.status === "已完成").length} />
        <Stat label="失败" value={all.filter((t) => t.status === "失败").length} />
      </div>

      <Card title="任务列表">
        <Toolbar placeholder="搜索任务/类型" onSearch={setQuery} statusOptions={["全部状态", "进行中", "已完成", "失败"]} onStatusChange={setStatus}>
          <Btn v="ghost" onClick={() => { clearCompleted(); toast("已清理已完成任务"); }}>清理已完成</Btn>
        </Toolbar>
        <Table
          cols={["任务", "类型", "触发人", "进度", "状态", "开始时间"]}
          rows={list.map((t) => [
            t.name,
            t.type,
            t.trigger,
            <div key="p" className="flex items-center gap-2 w-28"><Progress value={t.progress} className="flex-1" /><span className="text-[11px] text-slate-500">{t.progress}%</span></div>,
            t.status,
            t.startedAt,
          ])}
          actions={(i) => (
            <>
              <Btn v="ghost" onClick={() => setDetail(list[i])}>详情</Btn>
              <Btn v="ghost" onClick={() => retry(list[i])}>重试</Btn>
              {runtimeIds.has(list[i].id) && <Btn v="danger" onClick={() => { if (confirmDelete(list[i].name)) removeTask(list[i].id); }}>移除</Btn>}
            </>
          )}
        />
      </Card>

      <DetailDrawer
        open={!!detail}
        title={detail ? `任务详情 · ${detail.name}` : ""}
        onClose={() => setDetail(null)}
        fields={detail ? [
          { label: "任务 ID", value: detail.id },
          { label: "类型", value: detail.type },
          { label: "触发人", value: detail.trigger },
          { label: "状态", value: detail.status },
          { label: "开始时间", value: detail.startedAt },
          { label: "结束时间", value: detail.finishedAt ?? "-" },
        ] : []}
        footer={<><Btn v="ghost" onClick={() => { if (detail) downloadText(`${detail.id}.log`, detail.logs.join("\n")); toast("日志已导出"); }}>导出日志</Btn><Btn onClick={() => detail && retry(detail)}>重试</Btn></>}
      >
        {detail && (
          <div className="space-y-3">
            <div><div className="text-xs text-slate-500 mb-1">执行进度</div><Progress value={detail.progress} /></div>
            <div>
              <div className="text-xs text-slate-500 mb-1">执行日志</div>
              <pre className="bg-slate-900 text-emerald-300 rounded-md p-3 text-[11px] overflow-x-auto whitespace-pre-wrap">{detail.logs.join("\n")}</pre>
            </div>
            {detail.result && <div className="text-xs"><span className="text-slate-500">产物：</span>{detail.result}</div>}
          </div>
        )}
      </DetailDrawer>
    </div>
  );
}
