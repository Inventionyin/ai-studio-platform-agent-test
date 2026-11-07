# AGENTS.md — AI 测试开发平台（前端）

本文件是 AI 编码助手的开发约束，所有任务开始前必须先阅读本文件及 `docs/` 下文档。

## 1. 设计基准（最高优先级）
- `src/App.tsx`（或拆分后的 `src/components`、`src/pages`）是**视觉与交互的唯一标准**。
- 新页面必须复用现有基础组件：`Card`、`Btn`（primary / ghost / danger）、`Tag`、`Table`、`Toolbar`、`Input`、`Select`、`Stat`、`Bars`。
- **新增 UI 组件前，先检查是否已有可复用组件**；不得引入 Ant Design、MUI、shadcn 等第三方 UI 库。
- 详细视觉规范见 `docs/设计规范.md`，模块清单见 `docs/前端模块清单.md`，后端/整体方案见 `docs/技术方案.md`。

## 2. 技术栈
- React 19 + TypeScript（strict）+ Tailwind CSS v4 + Vite
- 路由：React Router（拆分阶段接入）
- 编辑器：Monaco（OpenAPI YAML / 脚本编辑）
- 请求：统一封装在 `src/api/`，页面内禁止直接 `fetch`
- 不要修改 `vite.config.ts`、`package.json` 中已有依赖版本，除非任务明确要求

## 3. 信息架构
三层结构，菜单定义以代码中的 `MENUS` 为准：
- **全局层**：工作台、技能市场、团队管理、个人中心
- **项目层**（`/project/:pid/*`）：项目概览、需求管理（含 AI 设计生成：原型图 / 接口设计）、测试用例、API 测试、WebUI 自动化、App 自动化、数据工厂、AI 助手、知识库、任务与报告
- **管理员层**（`/admin/*`）：全局模型配置、系统管理、平台审计

新增子页面：在对应菜单的 `tabs` 中注册，并沿用“面包屑 + 标题 + 子 Tab + 内容区”页面骨架。

## 4. 目标目录结构（拆分后）
```
src/
  components/ui/        基础组件（Card、Btn、Tag、Table…）
  components/business/  业务通用组件（任务悬浮窗、通知中心、项目切换器、版本对比器、原型渲染器、Monaco 封装）
  layouts/              GlobalLayout / ProjectLayout / AdminLayout
  pages/global|project|admin/
  hooks/                useTaskPolling、useSSE 等
  api/                  接口请求与类型定义
  mock/                 模拟数据（对接后端前使用）
  router.tsx
```

## 5. 跨模块联动（必须保留）
1. 需求详情 → 接口设计「导入到 API 测试」→ 跳转接口管理并预填接口定义
2. 需求详情 → 原型图「作为用例输入」→ 跳转 AI 生成用例并预选输入来源
3. 技能市场「添加到工作流」→ 跳转工作流编排器并插入工具节点
4. 任何异步生成/执行任务 → 推送到全局任务悬浮窗，并在「任务与报告」可见

## 6. 编码规则
- 每个页面组件单独文件，单文件不超过 300 行
- 所有数据结构定义 TypeScript 类型，放在 `src/api/types.ts`
- 文案统一中文；状态值使用 `Tag` 的语义色，不要硬编码新颜色
- 不使用 emoji 作为图标
- 修改后运行 `pnpm exec tsc --noEmit` 确保无类型错误
- **重构类任务不得改变任何视觉与交互**

## 7. 推荐开发顺序
1. 拆分 `App.tsx` 为上述目录结构 + 接入 React Router（不改视觉）
2. 补齐占位页（项目分配、个人中心、用例脚本、录制回放、UI Flow 编排、文档管理、版本对比、模型路由规则）
3. 业务通用组件：版本对比器、Monaco 封装、原型结构渲染器
4. 抽离 `src/api/` + mock，定义类型
5. 对接后端（FastAPI，接口规范见 `docs/技术方案.md` 3.4 节），SSE 用于 AI 对话与任务进度
