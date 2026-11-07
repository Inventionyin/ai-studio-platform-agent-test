import { useCallback, useEffect, useState } from "react";
import type { Task } from "@/api/types";
import { nowTime } from "@/lib/time";
import { advanceTasks } from "@/lib/tasks";

const STORAGE_KEY = "ast.runtime.tasks";
const MAX_TASKS = 50;

function seedTasks(): Task[] {
  return [{
    id: "T-RUN-1",
    name: "AI 生成用例 · 登录模块",
    type: "生成",
    progress: 40,
    status: "进行中",
    trigger: "张伟",
    startedAt: nowTime(),
    logs: [`[${nowTime()}] 任务创建`, `[${nowTime()}] 正在调用模型生成用例`],
  }];
}

function loadTasks(): Task[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Task[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed.slice(0, MAX_TASKS);
    }
  } catch {
    /* ignore corrupted storage */
  }
  return seedTasks();
}

export function useTaskPolling() {
  const [tasks, setTasks] = useState<Task[]>(loadTasks);

  useEffect(() => {
    const timer = setInterval(() => setTasks(advanceTasks), 800);
    return () => clearInterval(timer);
  }, []);

  const signature = tasks.map((t) => `${t.id}:${t.status}`).join("|");
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    } catch {
      /* storage full or unavailable */
    }
  }, [signature]);

  const addTask = useCallback((name: string, type = "生成", trigger = "当前用户") => {
    const task: Task = {
      id: `T-${Date.now()}`,
      name,
      type,
      progress: 0,
      status: "进行中",
      trigger,
      startedAt: nowTime(),
      logs: [`[${nowTime()}] 任务已创建`, `[${nowTime()}] 开始执行`],
    };
    setTasks((list) => [task, ...list].slice(0, MAX_TASKS));
    return task;
  }, []);

  const retryTask = useCallback((id: string) => {
    setTasks((list) =>
      list.map((t) =>
        t.id === id
          ? { ...t, progress: 0, status: "进行中", startedAt: nowTime(), finishedAt: undefined, logs: [...t.logs, `[${nowTime()}] 重新执行`] }
          : t,
      ),
    );
  }, []);

  const removeTask = useCallback((id: string) => {
    setTasks((list) => list.filter((t) => t.id !== id));
  }, []);

  const clearCompleted = useCallback(() => {
    setTasks((list) => list.filter((t) => t.status !== "已完成"));
  }, []);

  return { tasks, addTask, retryTask, removeTask, clearCompleted, setTasks };
}
