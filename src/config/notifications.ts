export const notifications = [
  { id: "N-1", title: "任务失败", detail: "下单流程冒烟 3 条用例失败", tone: "red" as const, to: "/tasks" },
  { id: "N-2", title: "评审邀请", detail: "王磊邀请你评审 12 条用例", tone: "blue" as const, to: "/testcases/review" },
  { id: "N-3", title: "Token 告警", detail: "本月消耗已达配额 82%", tone: "amber" as const, to: "/tasks" },
];
