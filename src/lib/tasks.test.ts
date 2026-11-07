import { describe, expect, it } from "vitest";
import type { Task } from "@/api/types";
import { advanceTasks } from "./tasks";

const task = (overrides: Partial<Task> = {}): Task => ({
  id: "T-1",
  name: "测试任务",
  type: "生成",
  progress: 40,
  status: "进行中",
  trigger: "张伟",
  startedAt: "10:00",
  logs: [],
  ...overrides,
});

describe("advanceTasks", () => {
  it("returns the same list when nothing is running", () => {
    const list = [task({ status: "已完成", progress: 100 })];
    expect(advanceTasks(list)).toBe(list);
  });

  it("advances a running task", () => {
    const [next] = advanceTasks([task({ progress: 40 })]);
    expect(next.progress).toBe(47);
    expect(next.status).toBe("进行中");
  });

  it("completes a task at 100 and appends a log", () => {
    const [next] = advanceTasks([task({ progress: 96 })]);
    expect(next.progress).toBe(100);
    expect(next.status).toBe("已完成");
    expect(next.finishedAt).toBeTruthy();
    expect(next.logs.length).toBe(1);
  });

  it("leaves failed tasks unchanged", () => {
    const failed = task({ status: "失败", progress: 60 });
    expect(advanceTasks([failed])[0]).toBe(failed);
  });
});
