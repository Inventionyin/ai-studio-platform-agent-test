import { del, get, post, put } from "./http";
import type { Project, RoleName } from "./types";

export const projectsApi = {
  list: () => get<Project[]>("/projects"),
  get: (id: string) => get<Project>(`/projects/${encodeURIComponent(id)}`),
  create: (name: string, description: string) => post<Project>("/projects", { name, description }),
  update: (id: string, patch: { name?: string; description?: string; status?: string }) =>
    put<Project>(`/projects/${encodeURIComponent(id)}`, patch),
  archive: (id: string) => del<null>(`/projects/${encodeURIComponent(id)}`),
  members: (projectId: string) => get<Project["members"]>(`/projects/${encodeURIComponent(projectId)}/members`),
  assign: (projectId: string, userId: string, role: RoleName) =>
    post<Project>(`/projects/${encodeURIComponent(projectId)}/members`, { userId, role }),
  unassign: (projectId: string, userId: string) =>
    del<Project>(`/projects/${encodeURIComponent(projectId)}/members/${encodeURIComponent(userId)}`),
};
