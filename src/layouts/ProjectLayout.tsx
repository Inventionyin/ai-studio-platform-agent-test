import { Navigate, useParams } from "react-router-dom";
import { useApp } from "@/store/app";
import { AppShell } from "./AppShell";

export function ProjectLayout() {
  const { pid } = useParams<{ pid: string }>();
  const { projects, projectsReady } = useApp();
  if (!projectsReady || projects.length === 0) {
    return (
      <div className="h-screen grid place-items-center bg-slate-100 text-xs text-slate-500">
        正在加载项目… <a href="/dashboard" className="ml-2 text-blue-600">返回工作台</a>
      </div>
    );
  }
  if (!projects.some((project) => project.id === pid)) {
    return <Navigate to={`/project/${projects[0].id}/overview`} replace />;
  }
  return <AppShell layer="project" />;
}
