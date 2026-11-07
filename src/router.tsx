import { lazy, type ComponentType, type ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { GlobalLayout } from "@/layouts/GlobalLayout";
import { ProjectLayout } from "@/layouts/ProjectLayout";
import { AdminLayout } from "@/layouts/AdminLayout";
import { NotFound } from "@/pages/NotFound";
import { Login } from "@/pages/Login";
import { AcceptInvite } from "@/pages/AcceptInvite";
import { RequireAdmin, RequireAuth } from "@/store/auth";

type PageModule = Record<string, ComponentType>;

const page = <T extends PageModule>(loader: () => Promise<T>, name: keyof T) =>
  lazy(async () => ({ default: (await loader())[name] }));

const Dashboard = page(() => import("@/pages/global/Dashboard"), "Dashboard");
const Skills = page(() => import("@/pages/global/Skills"), "Skills");
const McpServers = page(() => import("@/pages/global/McpServers"), "McpServers");
const TeamMembers = page(() => import("@/pages/global/TeamMembers"), "TeamMembers");
const TeamRoles = page(() => import("@/pages/global/TeamRoles"), "TeamRoles");
const TeamAssignments = page(() => import("@/pages/global/TeamAssignments"), "TeamAssignments");
const ProfileInfo = page(() => import("@/pages/global/ProfileInfo"), "ProfileInfo");
const ProfileSecurity = page(() => import("@/pages/global/ProfileSecurity"), "ProfileSecurity");
const ProfileAssets = page(() => import("@/pages/global/ProfileAssets"), "ProfileAssets");
const ProfileKeys = page(() => import("@/pages/global/ProfileKeys"), "ProfileKeys");
const Overview = page(() => import("@/pages/project/Overview"), "Overview");
const RequirementList = page(() => import("@/pages/project/RequirementList"), "RequirementList");
const RequirementDetail = page(() => import("@/pages/project/RequirementDetail"), "RequirementDetail");
const CaseList = page(() => import("@/pages/project/CaseList"), "CaseList");
const CaseGenerate = page(() => import("@/pages/project/CaseGenerate"), "CaseGenerate");
const CaseReview = page(() => import("@/pages/project/CaseReview"), "CaseReview");
const ApiManage = page(() => import("@/pages/project/ApiManage"), "ApiManage");
const ApiDebug = page(() => import("@/pages/project/ApiDebug"), "ApiDebug");
const ApiSuites = page(() => import("@/pages/project/ApiSuites"), "ApiSuites");
const ApiReports = page(() => import("@/pages/project/ApiReports"), "ApiReports");
const ElementLibrary = page(() => import("@/pages/project/ElementLibrary"), "ElementLibrary");
const UiScripts = page(() => import("@/pages/project/UiScripts"), "UiScripts");
const Recorder = page(() => import("@/pages/project/Recorder"), "Recorder");
const UiRuns = page(() => import("@/pages/project/UiRuns"), "UiRuns");
const Devices = page(() => import("@/pages/project/Devices"), "Devices");
const UiFlow = page(() => import("@/pages/project/UiFlow"), "UiFlow");
const AppRuns = page(() => import("@/pages/project/AppRuns"), "AppRuns");
const Chat = page(() => import("@/pages/project/Chat"), "Chat");
const Workflow = page(() => import("@/pages/project/Workflow"), "Workflow");
const KnowledgeList = page(() => import("@/pages/project/KnowledgeList"), "KnowledgeList");
const Documents = page(() => import("@/pages/project/Documents"), "Documents");
const Recall = page(() => import("@/pages/project/Recall"), "Recall");
const TaskList = page(() => import("@/pages/project/TaskList"), "TaskList");
const AgentEval = page(() => import("@/pages/project/AgentEval"), "AgentEval");
const AgentTest = page(() => import("@/pages/project/AgentTest"), "AgentTest");
const VersionCompare = page(() => import("@/pages/project/VersionCompare"), "VersionCompare");
const Providers = page(() => import("@/pages/admin/Providers"), "Providers");
const ModelRouting = page(() => import("@/pages/admin/ModelRouting"), "ModelRouting");
const ConnectionTest = page(() => import("@/pages/admin/ConnectionTest"), "ConnectionTest");
const Users = page(() => import("@/pages/admin/Users"), "Users");
const Health = page(() => import("@/pages/admin/Health"), "Health");
const Notifications = page(() => import("@/pages/admin/Notifications"), "Notifications");
const AuditLogPage = page(() => import("@/pages/admin/AuditLog"), "AuditLogPage");

function Auth({ children }: { children: ReactNode }) {
  return <RequireAuth>{children}</RequireAuth>;
}

function Admin({ children }: { children: ReactNode }) {
  return <RequireAdmin>{children}</RequireAdmin>;
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/accept-invite" element={<AcceptInvite />} />

        <Route element={<Auth><GlobalLayout /></Auth>}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="skills/list" element={<Skills />} />
          <Route path="skills/mcp" element={<Skills />} />
          <Route path="mcp" element={<Admin><McpServers /></Admin>} />
          <Route path="team/members" element={<Admin><TeamMembers /></Admin>} />
          <Route path="team/roles" element={<Admin><TeamRoles /></Admin>} />
          <Route path="team/assignments" element={<Admin><TeamAssignments /></Admin>} />
          <Route path="profile/info" element={<ProfileInfo />} />
          <Route path="profile/security" element={<ProfileSecurity />} />
          <Route path="profile/assets" element={<ProfileAssets />} />
          <Route path="profile/keys" element={<ProfileKeys />} />
        </Route>

        <Route path="/project/:pid" element={<Auth><ProjectLayout /></Auth>}>
          <Route index element={<Navigate to="overview" replace />} />
          <Route path="overview" element={<Overview />} />
          <Route path="requirements" element={<RequirementList />} />
          <Route path="requirements/:rid" element={<RequirementDetail />} />
          <Route path="testcases" element={<CaseList />} />
          <Route path="testcases/generate" element={<CaseGenerate />} />
          <Route path="testcases/review" element={<CaseReview />} />
          <Route path="api" element={<ApiManage />} />
          <Route path="api/debug" element={<ApiDebug />} />
          <Route path="api/suites" element={<ApiSuites />} />
          <Route path="api/reports" element={<ApiReports />} />
          <Route path="webui" element={<ElementLibrary />} />
          <Route path="webui/scripts" element={<UiScripts />} />
          <Route path="webui/recorder" element={<Recorder />} />
          <Route path="webui/runs" element={<UiRuns />} />
          <Route path="app" element={<Devices />} />
          <Route path="app/flow" element={<UiFlow />} />
          <Route path="app/runs" element={<AppRuns />} />
          <Route path="ai/chat" element={<Chat />} />
          <Route path="ai/workflow" element={<Workflow />} />
          <Route path="knowledge" element={<KnowledgeList />} />
          <Route path="knowledge/documents" element={<Documents />} />
          <Route path="knowledge/recall" element={<Recall />} />
          <Route path="tasks" element={<TaskList />} />
          <Route path="tasks/agent-eval" element={<AgentEval />} />
          <Route path="tasks/agent-test" element={<AgentTest />} />
          <Route path="tasks/compare" element={<VersionCompare />} />
        </Route>

        <Route path="/admin" element={<Admin><AdminLayout /></Admin>}>
          <Route index element={<Navigate to="models/providers" replace />} />
          <Route path="models/providers" element={<Providers />} />
          <Route path="models/routing" element={<ModelRouting />} />
          <Route path="models/test" element={<ConnectionTest />} />
          <Route path="system/users" element={<Users />} />
          <Route path="system/health" element={<Health />} />
          <Route path="system/notifications" element={<Notifications />} />
          <Route path="audit/logs" element={<AuditLogPage />} />
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}
