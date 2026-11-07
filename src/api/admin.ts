import { get, post, put } from "./http";
import type { AuditLog, HealthService, ModelProvider, NotificationChannel, PlatformUser, RoutingRule } from "./types";

export const adminApi = {
  providers: () => get<ModelProvider[]>("/admin/providers"),
  addProvider: (input: { name: string; models: string; apiKey: string; baseUrl: string }) =>
    post<ModelProvider>("/admin/providers", input),
  updateProvider: (id: string, patch: Partial<ModelProvider>) =>
    put<ModelProvider[]>(`/admin/providers/${encodeURIComponent(id)}`, patch),
  testProvider: (id: string) => post<ModelProvider[]>(`/admin/providers/${encodeURIComponent(id)}/test`),
  routing: () => get<RoutingRule[]>("/admin/routing"),
  saveRouting: (rules: RoutingRule[]) => put<RoutingRule[]>("/admin/routing", { rules }),
  users: () => get<PlatformUser[]>("/admin/users"),
  addUser: (input: { email: string; role: string }) =>
    post<{ invite: { id: string; email: string; role: string }; link: string; token: string }>("/admin/users", input),
  toggleUser: (id: string) => post<PlatformUser[]>(`/admin/users/${encodeURIComponent(id)}/toggle`),
  health: () => get<HealthService[]>("/admin/health"),
  checkHealth: () => post<HealthService[]>("/admin/health/check"),
  channels: () => get<NotificationChannel[]>("/admin/channels"),
  addChannel: (input: { name: string; type: string; event: string; target: string }) =>
    post<NotificationChannel[]>("/admin/channels", input),
  toggleChannel: (id: string) => post<NotificationChannel[]>(`/admin/channels/${encodeURIComponent(id)}/toggle`),
  audits: () => get<AuditLog[]>("/admin/audits"),
  audit: (id: string) => get<AuditLog>(`/admin/audits/${encodeURIComponent(id)}`),
};
