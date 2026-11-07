import { del, get, post, put, upload } from "./http";
import type { Skill } from "./types";

export const skillsApi = {
  list: (kind?: Skill["kind"]) => get<Skill[]>(`/skills${kind ? `?kind=${encodeURIComponent(kind)}` : ""}`),
  get: (id: string) => get<Skill>(`/skills/${encodeURIComponent(id)}`),
  use: (id: string) => post<Skill>(`/skills/${encodeURIComponent(id)}/use`),
  update: (id: string, patch: Partial<Pick<Skill, "name" | "description" | "category" | "prompt" | "params">>) =>
    put<Skill>(`/skills/${encodeURIComponent(id)}`, patch),
  importSkill: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return upload<Skill>("/skills/import", form);
  },
  remove: (id: string) => del<null>(`/skills/${encodeURIComponent(id)}`),
};
