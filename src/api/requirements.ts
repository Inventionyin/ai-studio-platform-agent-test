import { del, download, get, post, put, upload } from "./http";
import type { GenerationResult, Prototype, Requirement, SplitChild } from "./types";

export const requirementsApi = {
  list: () => get<Requirement[]>("/requirements"),
  get: (id: string) => get<Requirement>(`/requirements/${encodeURIComponent(id)}`),
  create: (input: { title: string; priority: Requirement["priority"]; description: string; owner: string; docName?: string }) =>
    post<Requirement>("/requirements", input),
  remove: (id: string) => del<null>(`/requirements/${encodeURIComponent(id)}`),
  update: (id: string, patch: { title?: string; priority?: Requirement["priority"]; status?: string; owner?: string; description?: string }) =>
    put<Requirement>(`/requirements/${encodeURIComponent(id)}`, patch),
  upload: (files: File[], title: string) => {
    const form = new FormData();
    form.append("title", title);
    files.forEach((file) => form.append("files", file));
    return upload<Requirement>("/requirements/upload", form);
  },
  generate: (id: string, kind: "prototype" | "api") =>
    post<GenerationResult>(`/requirements/${encodeURIComponent(id)}/generate`, { kind }),
  savePrototype: (id: string, prototype: Prototype) =>
    put<Requirement>(`/requirements/${encodeURIComponent(id)}/prototype`, prototype),
  saveYaml: (id: string, yaml: string) =>
    put<Requirement>(`/requirements/${encodeURIComponent(id)}/yaml`, { yaml }),
  split: (id: string) => post<Requirement>(`/requirements/${encodeURIComponent(id)}/split`),
  confirmSplit: (id: string, children: SplitChild[]) =>
    post<Requirement[]>(`/requirements/${encodeURIComponent(id)}/split/confirm`, { children }),
  children: (id: string) => get<Requirement[]>(`/requirements/${encodeURIComponent(id)}/children`),
  downloadFile: (requirementId: string, fileId: string) =>
    download(`/requirements/${encodeURIComponent(requirementId)}/files/${encodeURIComponent(fileId)}`),
  fileText: (requirementId: string, fileId: string) =>
    get<{ filename: string; text: string; parseStatus: string }>(
      `/requirements/${encodeURIComponent(requirementId)}/files/${encodeURIComponent(fileId)}/text`,
    ),
};
