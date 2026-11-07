import { get, post } from "./http";
import type { WorkflowDef, WorkflowNode, WorkflowRun } from "./types";

export const WORKFLOW_TEMPLATES: Record<string, WorkflowNode[]> = {
  "需求→原型": [
    { id: 1, type: "开始", label: "输入：需求文档", x: 30, y: 120, config: {} },
    { id: 2, type: "知识库检索", label: "检索业务规则", x: 220, y: 120, config: { kb: "业务规则库", topK: "5" } },
    { id: 3, type: "LLM 调用", label: "生成页面结构", x: 410, y: 120, config: { model: "Claude 3.5 Sonnet", prompt: "输出页面结构 JSON" } },
    { id: 4, type: "代码节点", label: "Schema 校验", x: 600, y: 120, config: { language: "python" } },
  ],
  "需求→接口": [
    { id: 1, type: "开始", label: "输入：需求文档", x: 30, y: 120, config: {} },
    { id: 2, type: "知识库检索", label: "检索接口规范", x: 220, y: 120, config: { kb: "接口文档库", topK: "5" } },
    { id: 3, type: "LLM 调用", label: "生成 OpenAPI", x: 410, y: 120, config: { model: "GPT-4o", prompt: "输出 OpenAPI 3.0 YAML" } },
    { id: 4, type: "代码节点", label: "Schema 校验", x: 600, y: 120, config: { language: "python" } },
  ],
};

export const workflowApi = {
  list: () => get<WorkflowDef[]>("/workflows"),
  save: (name: string, nodes: WorkflowNode[], description = "") =>
    post<WorkflowDef>("/workflows", { name, nodes, description }),
  run: (name: string, nodes: WorkflowNode[]) => post<WorkflowRun>("/workflows/run", { name, nodes }),
};
