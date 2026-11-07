import type { Layer } from "@/api/types";
import { DEFAULT_REQUIREMENT_ID } from "./constants";

export type MenuTab = { label: string; path: string };
export type MenuItem = { key: string; label: string; tabs: MenuTab[] };

export const MENUS: Record<Layer, MenuItem[]> = {
  global: [
    { key: "dashboard", label: "工作台", tabs: [{ label: "概览", path: "dashboard" }] },
    { key: "skills", label: "技能市场", tabs: [{ label: "技能列表", path: "skills/list" }, { label: "MCP 工具", path: "skills/mcp" }] },
    { key: "mcp", label: "MCP 服务", tabs: [{ label: "服务列表", path: "mcp" }] },
    { key: "team", label: "团队管理", tabs: [{ label: "成员列表", path: "team/members" }, { label: "角色权限", path: "team/roles" }, { label: "项目分配", path: "team/assignments" }] },
    { key: "profile", label: "个人中心", tabs: [{ label: "个人信息", path: "profile/info" }, { label: "安全设置", path: "profile/security" }, { label: "我的资产", path: "profile/assets" }, { label: "API Key", path: "profile/keys" }] },
  ],
  project: [
    { key: "overview", label: "项目概览", tabs: [{ label: "概览", path: "overview" }] },
    { key: "requirements", label: "需求管理", tabs: [{ label: "需求列表", path: "requirements" }, { label: "需求详情", path: "requirements/:rid" }] },
    { key: "testcases", label: "测试用例", tabs: [{ label: "用例列表", path: "testcases" }, { label: "AI 生成用例", path: "testcases/generate" }, { label: "用例评审", path: "testcases/review" }] },
    { key: "api", label: "API 测试", tabs: [{ label: "接口管理", path: "api" }, { label: "调试面板", path: "api/debug" }, { label: "套件与定时任务", path: "api/suites" }, { label: "执行报告", path: "api/reports" }] },
    { key: "webui", label: "WebUI 自动化", tabs: [{ label: "元素库", path: "webui" }, { label: "用例脚本", path: "webui/scripts" }, { label: "录制回放", path: "webui/recorder" }, { label: "执行记录", path: "webui/runs" }] },
    { key: "app", label: "App 自动化", tabs: [{ label: "设备管理", path: "app" }, { label: "UI Flow 编排", path: "app/flow" }, { label: "执行记录", path: "app/runs" }] },
    { key: "ai", label: "AI 助手", tabs: [{ label: "对话助手", path: "ai/chat" }, { label: "工作流编排器", path: "ai/workflow" }] },
    { key: "knowledge", label: "知识库", tabs: [{ label: "知识库列表", path: "knowledge" }, { label: "文档管理", path: "knowledge/documents" }, { label: "召回测试", path: "knowledge/recall" }] },
    { key: "tasks", label: "任务与报告", tabs: [{ label: "任务列表", path: "tasks" }, { label: "Agent 评测", path: "tasks/agent-eval" }, { label: "Agent 测试", path: "tasks/agent-test" }, { label: "版本对比", path: "tasks/compare" }] },
  ],
  admin: [
    { key: "models", label: "全局模型配置", tabs: [{ label: "模型供应商", path: "models/providers" }, { label: "模型路由规则", path: "models/routing" }, { label: "连接测试", path: "models/test" }] },
    { key: "system", label: "系统管理", tabs: [{ label: "用户管理", path: "system/users" }, { label: "环境检测", path: "system/health" }, { label: "通知配置", path: "system/notifications" }] },
    { key: "audit", label: "平台审计", tabs: [{ label: "审计日志", path: "audit/logs" }] },
  ],
};

export function layerOf(pathname: string): Layer {
  if (pathname.startsWith("/admin")) return "admin";
  if (pathname.startsWith("/project/")) return "project";
  return "global";
}

export function projectIdOf(pathname: string): string | undefined {
  return pathname.match(/^\/project\/([^/]+)/)?.[1];
}

function patternMatch(pathname: string, pattern: string): boolean {
  const re = new RegExp(`^/${pattern.replace(/:[^/]+/g, "[^/]+")}/?$`);
  return re.test(pathname);
}

export function basePath(layer: Layer, pid?: string): string {
  if (layer === "project") return `/project/${pid ?? ""}`;
  if (layer === "admin") return "/admin";
  return "";
}

export function tabHref(layer: Layer, pid: string | undefined, path: string): string {
  const p = path.replace(":rid", DEFAULT_REQUIREMENT_ID);
  return `${basePath(layer, pid)}/${p}`.replace(/\/+/g, "/");
}

export interface ResolvedNav {
  layer: Layer;
  pid?: string;
  relative: string;
  menu?: MenuItem;
  tab?: MenuTab;
}

export function resolveNav(pathname: string): ResolvedNav {
  const layer = layerOf(pathname);
  let relative = pathname;
  let pid: string | undefined;
  if (layer === "project") {
    pid = projectIdOf(pathname);
    relative = pathname.replace(/^\/project\/[^/]+/, "") || "/";
  } else if (layer === "admin") {
    relative = pathname.replace(/^\/admin/, "") || "/";
  }
  for (const menu of MENUS[layer]) {
    for (const tab of menu.tabs) {
      if (patternMatch(relative, tab.path)) return { layer, pid, relative, menu, tab };
    }
  }
  return { layer, pid, relative };
}
