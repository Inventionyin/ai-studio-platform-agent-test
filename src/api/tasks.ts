import { get } from "./http";
import type { Task, VersionSnapshot } from "./types";

export const tasksApi = {
  history: () => get<Task[]>("/tasks"),
  get: (id: string) => get<Task>(`/tasks/${encodeURIComponent(id)}`),
  versions: (kind?: string) => get<VersionSnapshot[]>(`/versions${kind ? `?kind=${encodeURIComponent(kind)}` : ""}`),
  compare: (aId: string, bId: string) =>
    get<{ left: VersionSnapshot; right: VersionSnapshot }>(
      `/versions/compare?a=${encodeURIComponent(aId)}&b=${encodeURIComponent(bId)}`,
    ),
};
