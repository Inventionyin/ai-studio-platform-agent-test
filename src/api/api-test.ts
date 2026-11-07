import { del, get, post } from "./http";
import type { ApiDefinitionInput, ApiEndpoint, ApiReport, ApiResponse, ApiSuite, Assertion, HttpMethod } from "./types";

export const apiTestApi = {
  definitions: () => get<ApiEndpoint[]>("/api-defs"),
  create: (input: ApiDefinitionInput) => post<ApiEndpoint>("/api-defs", input),
  remove: (id: string) => del<null>(`/api-defs/${encodeURIComponent(id)}`),
  importYaml: (yaml: string, module = "导入") => post<ApiEndpoint[]>("/api-defs/import", { yaml, module }),
  send: (req: { method: HttpMethod; url: string; body: string; assertions: Assertion[] }) =>
    post<ApiResponse>("/api-defs/send", req),
  suites: () => get<ApiSuite[]>("/api-suites"),
  createSuite: (input: { name: string; cron: string; count: number }) => post<ApiSuite>("/api-suites", input),
  runSuite: (id: string) => post<ApiSuite>(`/api-suites/${encodeURIComponent(id)}/run`),
  reports: () => get<ApiReport[]>("/api-reports"),
};
