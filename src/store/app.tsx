import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { projectsApi } from "@/api";
import type { Project, RoleName } from "@/api/types";
import { setActiveProjectId } from "@/api/http";
import { useTaskPolling } from "@/hooks/useTaskPolling";
import { setErrorNotifier } from "@/lib/notify";
import { useAuth } from "./auth";

export interface ToastItem {
  id: number;
  message: string;
}

interface AppStore {
  projects: Project[];
  projectsReady: boolean;
  projectId: string;
  projectName: string;
  projectRole: RoleName | "";
  isAdmin: boolean;
  setProjectId: (id: string) => void;
  refreshProjects: () => Promise<Project[]>;
  addTask: (name: string, type?: string) => void;
  retryTask: (id: string) => void;
  removeTask: (id: string) => void;
  clearCompleted: () => void;
  dockOpen: boolean;
  setDockOpen: (open: boolean) => void;
  toasts: ToastItem[];
  toast: (message: string) => void;
}

const AppCtx = createContext<AppStore | null>(null);
const TaskCtx = createContext<ReturnType<typeof useTaskPolling>["tasks"] | null>(null);

function initialProject(): string {
  try {
    return localStorage.getItem("ast.project") || "";
  } catch {
    return "";
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const { user, isAdmin } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsReady, setProjectsReady] = useState(false);
  const [projectId, setProjectIdState] = useState(initialProject);
  const [dockOpen, setDockOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const { tasks, addTask, retryTask, removeTask, clearCompleted } = useTaskPolling();

  const toast = useCallback((message: string) => {
    const id = Date.now() + Math.random();
    setToasts((list) => [...list, { id, message }]);
    window.setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 2600);
  }, []);

  const applyProject = useCallback((id: string) => {
    setProjectIdState(id);
    setActiveProjectId(id || null);
    try {
      if (id) localStorage.setItem("ast.project", id);
    } catch {
      /* ignore */
    }
  }, []);

  const refreshProjects = useCallback(async () => {
    if (!user) {
      setProjects([]);
      setProjectsReady(true);
      return [];
    }
    setProjectsReady(false);
    try {
      const list = await projectsApi.list();
      setProjects(list);
      setProjectIdState((current) => {
        const next = list.some((item) => item.id === current) ? current : list[0]?.id ?? "";
        setActiveProjectId(next || null);
        try {
          if (next) localStorage.setItem("ast.project", next);
        } catch {
          /* ignore */
        }
        return next;
      });
      return list;
    } finally {
      setProjectsReady(true);
    }
  }, [user]);

  useEffect(() => {
    void refreshProjects();
  }, [refreshProjects]);

  useEffect(() => {
    setActiveProjectId(projectId || null);
  }, [projectId]);

  useEffect(() => {
    setErrorNotifier(toast);
    return () => setErrorNotifier(null);
  }, [toast]);

  const setProjectId = useCallback((id: string) => {
    applyProject(id);
  }, [applyProject]);

  const project = projects.find((item) => item.id === projectId);
  const projectRole = useMemo<RoleName | "">(() => {
    if (!project || !user) return "";
    if (isAdmin) return "管理员";
    return project.members.find((member) => member.userId === user.id)?.role ?? "";
  }, [project, user, isAdmin]);

  const value = useMemo<AppStore>(() => ({
    projects,
    projectsReady,
    projectId,
    projectName: project?.name ?? "",
    projectRole,
    isAdmin,
    setProjectId,
    refreshProjects,
    addTask: (name, type) => {
      addTask(name, type, user?.name ?? "当前用户");
      setDockOpen(true);
    },
    retryTask,
    removeTask,
    clearCompleted,
    dockOpen,
    setDockOpen,
    toasts,
    toast,
  }), [projects, projectsReady, projectId, project, projectRole, isAdmin, setProjectId, refreshProjects, addTask, retryTask, removeTask, clearCompleted, dockOpen, toasts, toast, user]);

  if (user && !projectsReady) {
    return <div className="h-screen grid place-items-center bg-slate-100 text-xs text-slate-500">正在加载项目…</div>;
  }

  return (
    <AppCtx.Provider value={value}>
      <TaskCtx.Provider value={tasks}>{children}</TaskCtx.Provider>
    </AppCtx.Provider>
  );
}

export function useApp(): AppStore {
  const ctx = useContext(AppCtx);
  if (!ctx) throw new Error("useApp 必须在 AppProvider 内使用");
  return ctx;
}

export function useTasks() {
  const ctx = useContext(TaskCtx);
  if (!ctx) throw new Error("useTasks 必须在 AppProvider 内使用");
  return ctx;
}
