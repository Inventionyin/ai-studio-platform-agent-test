import { get, post, put } from "./http";
import type { AppRun, Device, FlowNode } from "./types";

export const appAutoApi = {
  devices: () => get<Device[]>("/app/devices"),
  toggleDevice: (id: string) => post<Device[]>(`/app/devices/${encodeURIComponent(id)}/toggle`),
  releaseDevice: (id: string) => post<Device[]>(`/app/devices/${encodeURIComponent(id)}/release`),
  flows: () => get<FlowNode[]>("/app/flows"),
  saveFlow: (nodes: FlowNode[]) => put<FlowNode[]>("/app/flows", { nodes }),
  runs: () => get<AppRun[]>("/app/runs"),
  execute: (flowName: string, device: string) => post<AppRun>("/app/runs", { flow: flowName, device }),
};
