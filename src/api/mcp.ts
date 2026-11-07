import { del, get, post, put } from "./http";
import type { McpServer } from "./types";

export const mcpApi = {
  list: () => get<McpServer[]>("/mcp/servers"),
  create: (input: { name: string; command: string; args: string[]; env: Record<string, string>; description: string }) =>
    post<McpServer>("/mcp/servers", input),
  update: (id: string, input: Partial<{ name: string; command: string; args: string[]; env: Record<string, string>; description: string }>) =>
    put<McpServer>(`/mcp/servers/${encodeURIComponent(id)}`, input),
  remove: (id: string) => del<null>(`/mcp/servers/${encodeURIComponent(id)}`),
  test: (id: string) => post<McpServer>(`/mcp/servers/${encodeURIComponent(id)}/test`),
};
