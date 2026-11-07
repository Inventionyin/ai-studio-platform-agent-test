import { del, get, post, put } from "./http";
import type { RecorderStep, UiElement, UiPage, UiRun, UiScript } from "./types";

export const webuiApi = {
  pages: () => get<UiPage[]>("/ui/pages"),
  elements: (pageId?: string) => get<UiElement[]>(`/ui/elements${pageId ? `?pageId=${encodeURIComponent(pageId)}` : ""}`),
  addElement: (input: { pageId: string; name: string; selectorType: UiElement["selectorType"]; selectorValue: string }) =>
    post<UiElement>("/ui/elements", input),
  removeElement: (id: string) => del<null>(`/ui/elements/${encodeURIComponent(id)}`),
  scripts: () => get<UiScript[]>("/ui/scripts"),
  saveScript: (id: string, content: string) => put<UiScript>(`/ui/scripts/${encodeURIComponent(id)}`, { content }),
  createScript: (name: string, content: string, framework = "Playwright + POM") =>
    post<UiScript>("/ui/scripts", { name, content, framework }),
  runs: () => get<UiRun[]>("/ui/runs"),
  execute: (scriptId: string, browser = "Chromium") => post<UiRun>("/ui/runs", { scriptId, browser }),
  recorderSteps: () => get<RecorderStep[]>("/ui/recorder"),
  addRecorderStep: (step: Omit<RecorderStep, "id">) => post<RecorderStep[]>("/ui/recorder", step),
  clearRecorder: () => del<RecorderStep[]>("/ui/recorder"),
};
