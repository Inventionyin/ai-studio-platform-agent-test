import type { RoleName } from "@/api/types";

export const DEFAULT_PROJECT_ID = "ecommerce";
export const DEFAULT_REQUIREMENT_ID = "REQ-021";

export const PROJECT_SEED = [
  { id: "ecommerce", name: "电商核心系统" },
  { id: "payment", name: "支付中台" },
  { id: "member", name: "会员营销平台" },
];

export const MODELS = ["GPT-4o", "Claude 3.5 Sonnet", "DeepSeek-V3", "Qwen2.5-72B"];

export const ROLE_OPTIONS: RoleName[] = ["管理员", "开发者", "评审者", "只读"];
