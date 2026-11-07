import type { Task } from "@/api/types";
import { nowTime } from "./time";

export function advanceTasks(list: Task[]): Task[] {
  if (!list.some((t) => t.status === "进行中")) return list;
  return list.map((t) => {
    if (t.status !== "进行中") return t;
    const next = Math.min(100, t.progress + 7);
    if (next >= 100) {
      return {
        ...t,
        progress: 100,
        status: "已完成",
        finishedAt: nowTime(),
        logs: [...t.logs, `[${nowTime()}] 任务完成`],
      };
    }
    return { ...t, progress: next };
  });
}
