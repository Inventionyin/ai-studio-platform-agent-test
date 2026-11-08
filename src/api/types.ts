/* ============ 通用 ============ */
export type Layer = "global" | "project" | "admin";
export type TaskStatus = "进行中" | "已完成" | "失败";
export type CasePriority = "P0" | "P1" | "P2";
export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
export type RoleName = "管理员" | "开发者" | "评审者" | "只读";

export interface PageResult<T> {
  total: number;
  items: T[];
}

/* ============ 项目 / 团队 ============ */
export interface Project {
  id: string;
  name: string;
  description: string;
  status: string;
  requirementCount: number;
  caseCount: number;
  apiCount: number;
  taskCount: number;
  passRate: number;
  members: { userId: string; name: string; role: RoleName }[];
}

export interface Member {
  id: string;
  name: string;
  email: string;
  role: RoleName;
  dept: string;
  projectCount: number;
  status: string;
  lastLogin: string;
}

export interface Role {
  name: RoleName;
  description: string;
  memberCount: number;
  permissions: string[];
}

/* ============ 需求 / 生成 ============ */
export interface Requirement {
  id: string;
  projectId?: string;
  parentId?: string | null;
  kind?: "main" | "sub";
  title: string;
  priority: CasePriority;
  status: string;
  owner: string;
  version: string;
  description: string;
  docName?: string;
  points: string[];
  createdAt: string;
  updatedAt: string;
  prototype?: Prototype;
  apiYaml?: string;
  generations: GenerationResult[];
  splitStatus?: string;
  splitProposal?: { children: SplitChild[]; mode?: "ai" | "local" } | null;
  files?: RequirementFile[];
}

export interface RequirementFile {
  id: string;
  filename: string;
  size: number;
  parseStatus: string;
  createdAt: string;
}

export interface SplitChild {
  title: string;
  description: string;
  priority: CasePriority;
  points: string[];
}

export interface PrototypeSection {
  name: string;
  items: string[];
}

export interface PrototypePage {
  name: string;
  sections: PrototypeSection[];
}

export interface Prototype {
  flow: string;
  pages: PrototypePage[];
}

export interface ApiEndpoint {
  id: string;
  method: HttpMethod;
  path: string;
  summary: string;
  status: string;
  source: string;
  module: string;
  creator: string;
}

export interface CheckItem {
  label: string;
  status: "通过" | "警告" | "失败";
}

export interface GenerationResult {
  id: string;
  kind: "prototype" | "api";
  version: string;
  createdAt: string;
  prototype?: Prototype;
  yaml?: string;
  endpoints?: ApiEndpoint[];
  checks: CheckItem[];
}

/* ============ 测试用例 ============ */
export interface TestCase {
  id: string;
  projectId?: string;
  title: string;
  module: string;
  type: string;
  priority: CasePriority;
  status: string;
  version: string;
  precondition: string;
  steps: string[];
  expected: string;
  source: string;
  owner: string;
  updatedAt: string;
}

export interface CaseComment {
  id: string;
  author: string;
  content: string;
  time: string;
  action: "提交评审" | "通过" | "驳回" | "意见";
}

export interface CaseReviewItem {
  caseId: string;
  title: string;
  status: string;
  comments: CaseComment[];
}

/* ============ API 测试 ============ */
export interface Assertion {
  type: string;
  expression: string;
  expected: string;
}

export interface ApiSuite {
  id: string;
  name: string;
  count: number;
  cron: string;
  lastResult: string;
  status: string;
}

export interface ApiReport {
  id: string;
  name: string;
  passed: number;
  total: number;
  duration: string;
  time: string;
  result: string;
  failures: { case: string; error: string }[];
}

export interface ApiResponse {
  status: number;
  statusText: string;
  timeMs: number;
  sizeKb: number;
  body: string;
  assertionsPassed: number;
  assertionsTotal: number;
}

export interface ApiDefinitionInput {
  method: HttpMethod;
  path: string;
  name: string;
  module: string;
}

/* ============ WebUI ============ */
export interface UiElement {
  id: string;
  pageId: string;
  pageName: string;
  name: string;
  selectorType: "CSS" | "XPath" | "Text";
  selectorValue: string;
}

export interface UiPage {
  id: string;
  name: string;
  url: string;
}

export interface UiScript {
  id: string;
  name: string;
  framework: string;
  content: string;
  updatedAt: string;
  status: string;
}

export interface RecorderStep {
  id: number;
  action: string;
  target: string;
  value: string;
}

export interface UiRun {
  id: string;
  script: string;
  browser: string;
  result: string;
  shots: number;
  video: boolean;
  time: string;
  duration: string;
}

/* ============ App 自动化 ============ */
export interface Device {
  id: string;
  name: string;
  os: string;
  resolution: string;
  status: string;
  occupancy: string;
}

export interface FlowNode {
  id: string;
  type: string;
  label: string;
  config: string;
}

export interface AppRun {
  id: string;
  flow: string;
  device: string;
  result: string;
  time: string;
  duration: string;
}

/* ============ 技能 ============ */
export interface Skill {
  id: string;
  name: string;
  description: string;
  category: string;
  kind: "Skill" | "MCP";
  calls: number;
  version: string;
  prompt?: string;
  source?: string;
  params: { name: string; type: string; required: boolean; desc: string }[];
}

export interface McpServer {
  id: string;
  name: string;
  command: string;
  args: string[];
  description: string;
  envKeys: string[];
  status: string;
  tools: { name: string; description: string; inputSchema?: Record<string, unknown> }[];
  lastTestedAt?: string | null;
  lastError?: string;
}


/* ============ 知识库 ============ */
export interface KnowledgeBase {
  id: string;
  name: string;
  description: string;
  docs: number;
  chunks: number;
  embedding: string;
  status: string;
  updatedAt: string;
}

export interface KbDocument {
  id: string;
  kbId: string;
  filename: string;
  size: string | number;
  parseStatus: string;
  chunks: number;
  uploadedAt: string;
}

export interface RecallHit {
  doc: string;
  chunkIndex: number;
  content: string;
  score: number;
}

/* ============ AI 助手 ============ */
export interface Citation {
  doc: string;
  chunk: string;
  score: number;
}

export interface ToolCall {
  name: string;
  args: string;
  result: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  citations?: Citation[];
  toolCalls?: ToolCall[];
  usage?: { prompt: number; completion: number };
}

export interface Conversation {
  id: string;
  title: string;
  updatedAt: string;
  messages: ChatMessage[];
}

export interface ChatConfig {
  model: string;
  kbIds: string[];
  systemPrompt: string;
}

/* ============ 工作流 ============ */
export interface WorkflowNode {
  id: number;
  type: string;
  label: string;
  x: number;
  y: number;
  config: Record<string, string>;
}

export interface WorkflowDef {
  id: string;
  name: string;
  description: string;
  nodes: WorkflowNode[];
  updatedAt: string;
}

export interface WorkflowRun {
  id: string;
  workflow: string;
  status: string;
  startedAt: string;
  nodeStates: Record<string, "pending" | "running" | "success" | "failed">;
  logs: string[];
}

/* ============ 任务与报告 ============ */
export interface Task {
  id: string;
  name: string;
  type: string;
  progress: number;
  status: TaskStatus;
  trigger: string;
  startedAt: string;
  finishedAt?: string;
  logs: string[];
  result?: string;
}

export interface VersionSnapshot {
  id: string;
  name: string;
  kind: string;
  version: string;
  content: string;
  createdAt: string;
}

/* ============ 管理员 ============ */
export interface ModelProvider {
  id: string;
  name: string;
  models: string;
  apiKey: string;
  baseUrl: string;
  status: string;
  latencyMs: number;
}

export interface RoutingRule {
  id: string;
  taskType: string;
  primary: string;
  fallback: string;
  enabled: boolean;
}

export interface PlatformUser {
  id: string;
  name: string;
  dept: string;
  role: string;
  lastLogin: string;
  status: string;
}

export interface HealthService {
  name: string;
  status: string;
  metric: string;
  detail: string;
}

export interface NotificationChannel {
  id: string;
  name: string;
  type: string;
  event: string;
  target: string;
  status: string;
}

export interface AuditLog {
  id: string;
  time: string;
  operator: string;
  action: string;
  target: string;
  tokens: string;
  ip: string;
  detail: Record<string, string>;
}

/* ============ 个人中心 ============ */
export interface UserProfile {
  id: string;
  name: string;
  email: string;
  phone: string;
  title: string;
  dept: string;
  role: RoleName;
  bio: string;
}

export interface Asset {
  id: string;
  name: string;
  type: string;
  project: string;
  size: string;
  createdAt: string;
}

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsed: string;
  status: string;
}

/* ============ 工作台 ============ */
export interface DashboardData {
  projects: Project[];
  todos: string[];
  activities: { user: string; action: string; time: string }[];
  alerts: { level: string; text: string }[];
  tokenTrend: number[];
  stats: { label: string; value: string | number; delta?: string; up?: boolean }[];
}

/* ============ Agent 评测 ============ */
export interface AgentLlmCall {
  node: string;
  model: string;
  prompt: string;
  response: string;
  input_tokens?: number | null;
  output_tokens?: number | null;
  latency_ms: number;
  at: string;
}

export interface AgentToolCall {
  name: string;
  args: Record<string, unknown>;
  result: unknown;
  status: string;
  latency_ms: number;
  at: string;
}

export interface AgentRetrieval {
  query: string;
  backend: string;
  hits: { title: string; source: string; score: number | null }[];
  fallback: boolean;
  error: string | null;
  at: string;
}

export interface AgentTraceStep {
  name: string;
  status: string;
  at: string;
  detail?: unknown;
}

export interface AgentEvalTrace {
  run_id: string;
  trace_id: string;
  session_id: string;
  customer_id?: string | null;
  channel?: string;
  message: string;
  started_at?: string;
  finished_at?: string | null;
  intent: string;
  agent: string;
  status: string;
  answer: string;
  steps?: AgentTraceStep[];
  llm_calls: AgentLlmCall[];
  tool_calls: AgentToolCall[];
  retrievals: AgentRetrieval[];
  latency_ms: number;
}

export type AgentEvalRun = AgentEvalTrace;

export interface AgentEvalCase {
  case_id: string;
  message: string;
  run_id: string;
  trace_id: string;
  actual_intent: string;
  expected_intent: string;
  intent_ok: boolean;
  actual_agent: string;
  expected_agent: string;
  agent_ok: boolean;
  actual_status: string;
  expected_status: string;
  status_ok: boolean;
  tools: string[];
  expected_tool?: string | null;
  tool_ok: boolean;
  answer_facts: string[];
  answer_any: string[];
  answer: string;
  fact_ok: boolean;
  latency_ms: number;
  trace_llm_calls: number;
  trace_tool_calls: number;
  trace?: AgentEvalTrace;
}

export interface AgentEvalMetrics {
  total: number;
  intent_accuracy: number;
  agent_accuracy: number;
  status_accuracy: number;
  tool_accuracy: number;
  answer_fact_accuracy: number;
  trace_coverage: number;
  avg_latency_ms: number;
  case_pass_rate: number;
}

export interface AgentEvalReport {
  llm: string;
  metrics: AgentEvalMetrics;
  results: AgentEvalCase[];
}

export interface AgentEvalReportMeta {
  name: "rule" | "real" | string;
  label: string;
  file: string;
  exists: boolean;
  case_count: number;
  llm: string | null;
}

export interface AgentHealth {
  status: string;
  llm: string;
  graph: string;
  rag: string;
  rag_error: string | null;
  trace_store: string;
  trace_error: string | null;
}

export interface AgentChatResponse {
  run_id: string;
  trace_id: string;
  session_id: string;
  intent: string;
  agent: string;
  status: string;
  answer: string;
  tools: Record<string, unknown>[];
  latency_ms: number;
}

export interface AgentChatResult {
  response: AgentChatResponse;
  trace: AgentEvalTrace;
}

export interface AgentVerifyCheck {
  label: string;
  passed: boolean;
  detail: string;
}

export interface AgentVerifyProbe {
  key: string;
  label: string;
  message: string;
  passed: boolean;
  checks: AgentVerifyCheck[];
  runId: string;
  agent: string;
  intent: string;
  status: string;
  answer: string;
  latencyMs: number;
  traceSummary: {
    llmCalls: number;
    toolCalls: number;
    retrievals: number;
    latencyMs: number;
  };
  trace: AgentEvalTrace;
}

export interface AgentVerifyResult {
  passed: boolean;
  health: AgentHealth;
  probes: AgentVerifyProbe[];
}

/* ============ Agent 全链路追踪 ============ */
export type AgentAdapterType = "http" | "cli" | "webui" | "app" | "shangpin";
export type AgentInputType = "text" | "json" | "cli";
export type AgentRunStatus = "pending" | "running" | "pass" | "fail" | "needs_review" | "error" | "observed";
export type TraceSpanType = "command" | "agent" | "llm" | "tool" | "retrieval" | "final" | "judge" | "ui" | "assertion" | "sse";
export type TraceSpanStatus = "ok" | "error" | "skipped";
export type EvaluatorType = "rule" | "llm" | "human";
export type EvaluationVerdict = "pass" | "fail" | "needs_review" | "unavailable";
export type FixRecordStatus = "open" | "in_progress" | "fixed" | "verified" | "closed" | "reopened";

export interface AgentTargetConfig {
  baseUrl?: string;
  adminBaseUrl?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  timeout?: number;
  headers?: Record<string, string>;
  customerPhones?: string[];
  smsCode?: string;
  clientType?: string;
  throttleMs?: number;
  rateLimitWaitSeconds?: number;
  cartCleanup?: boolean;
  engine?: "legacy" | "graph";
  adminUsername?: string;
  adminPassword?: string;
}

export interface AgentTarget {
  id: string;
  projectId: string;
  name: string;
  adapterType: AgentAdapterType;
  description: string;
  config: AgentTargetConfig;
  status: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationCard {
  spuId?: string;
  name?: string;
  price?: number | string;
  [key: string]: unknown;
}

export interface ConversationTokens {
  prompt?: number;
  completion?: number;
}

export interface ConversationTurn {
  input: string;
  answer: string;
  reasoning?: string | null;
  cards?: ConversationCard[] | null;
  sources?: string[] | null;
  tokens?: ConversationTokens | null;
  degraded?: boolean | null;
  runId?: number | string | null;
  agent?: string | null;
  intent?: string | null;
  tools?: string[] | null;
  sessionStatus?: string | null;
  latencyMs?: number | null;
}

export interface AgentCheckRule {
  type: string;
  expected?: unknown;
}

export interface AgentCase {
  id: string;
  projectId: string;
  targetId: string | null;
  name: string;
  inputType: AgentInputType;
  command: string;
  turns: string[];
  payload: Record<string, unknown> | null;
  expected: Record<string, unknown> | null;
  checks: AgentCheckRule[] | null;
  tags: string[] | null;
  priority: CasePriority;
  enabled: boolean;
  version: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface AgentRun {
  id: string;
  projectId: string;
  targetId: string;
  caseId: string | null;
  conversationId?: string | null;
  sourceType?: "ai_test" | "human_manual" | "production" | string;
  environment?: string;
  externalSessionId?: string;
  externalRunId?: string;
  datasetVersion?: string;
  isTest?: boolean;
  piiMasked?: boolean;
  metadata?: Record<string, unknown>;
  ingestedAt?: string | null;
  traceId: string;
  status: AgentRunStatus;
  input: Record<string, unknown> | null;
  finalOutput: Record<string, unknown> | null;
  conversation: ConversationTurn[];
  verdict: Record<string, unknown> | null;
  error: string | null;
  latencyMs: number | null;
  totalTokens: number | null;
  startedAt: string | null;
  finishedAt: string | null;
  triggeredBy: string | null;
  createdAt: string;
}

export interface TraceSpan {
  id: string;
  traceId: string;
  runId: string;
  parentSpanId: string | null;
  spanType: TraceSpanType;
  name: string;
  status: TraceSpanStatus;
  input: unknown;
  output: unknown;
  error: string | null;
  startedAt: string;
  endedAt: string | null;
  latencyMs: number | null;
  attributes: Record<string, unknown> | null;
}

export interface TraceArtifact {
  id: string;
  traceId: string;
  runId: string;
  spanId: string | null;
  artifactType: string;
  name: string;
  path: string;
  mime: string;
  size: number | null;
  createdAt: string;
}

export interface AgentEvaluationCheck {
  label: string;
  passed: boolean;
  detail?: string;
  evidenceSpanIds?: string[];
}

export interface RunEvaluation {
  id: string;
  runId: string;
  evaluatorType: EvaluatorType;
  verdict: EvaluationVerdict;
  score: number | null;
  checks: AgentEvaluationCheck[] | null;
  comment: string | null;
  model: string | null;
  prompt: string | null;
  response: string | null;
  createdBy: string | null;
  createdAt: string;
}

export interface FixRecord {
  id: string;
  projectId: string;
  runId: string;
  caseId: string | null;
  targetId: string | null;
  title: string;
  slug: string;
  severity: CasePriority;
  category: string;
  fixTarget: string;
  symptom: string;
  rootCause: string;
  fixAction: string;
  changedFiles: string[] | null;
  beforeRunId: string | null;
  afterRunId: string | null;
  status: FixRecordStatus;
  docPath: string | null;
  aiSuggestion: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RunDetail {
  run: AgentRun;
  spans: TraceSpan[];
  artifacts: TraceArtifact[];
  evaluations: RunEvaluation[];
}

export interface AgentConversation {
  id: string;
  projectId: string;
  targetId: string;
  sourceType: "human_manual" | "production" | string;
  environment: string;
  externalSessionId: string;
  customerRef: string;
  channel: string;
  status: string;
  messageCount: number;
  isTest: boolean;
  piiMasked: boolean;
  metadata: Record<string, unknown>;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AgentConversationDetail {
  conversation: AgentConversation;
  runs: RunDetail[];
}

export interface AgentDataSummary {
  testRuns: number;
  manualConversations: number;
  productionConversations: number;
  failedTestRuns: number;
}

export interface AgentTestSummary {
  targets: number;
  cases: number;
  runs: number;
  passRate: number;
  failCount: number;
  needsReviewCount: number;
  fixes: number;
  docs: number;
}

export interface AgentDocMeta {
  name: string;
  path: string;
  size: number;
  updatedAt: string;
}

export interface AgentDocContent {
  name: string;
  content: string;
}
