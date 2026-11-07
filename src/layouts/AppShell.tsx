import { Suspense, useEffect } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import type { Layer } from "@/api/types";
import { MENUS, resolveNav, tabHref } from "@/config/menu";
import { useApp } from "@/store/app";
import { useAuth } from "@/store/auth";
import { cx } from "@/lib/cx";
import { NotificationCenter, ProjectSwitcher, TaskDock } from "@/components/business";
import { ToastStack } from "@/components/ui";

export function AppShell({ layer }: { layer: Layer }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { projectId, projectName, toasts, setProjectId } = useApp();
  const { user, isAdmin, logout } = useAuth();
  const nav = resolveNav(location.pathname);
  const menu = nav.menu ?? MENUS[layer][0];
  const activeTab = nav.tab?.label ?? menu.tabs[0].label;
  const globalMenus = MENUS.global.filter((m) => (m.key !== "team" && m.key !== "mcp") || isAdmin);
  const layerMenus = layer === "global" ? globalMenus : MENUS[layer];

  useEffect(() => {
    if (layer === "project" && nav.pid && nav.pid !== projectId) setProjectId(nav.pid);
  }, [layer, nav.pid, projectId, setProjectId]);

  const goTab = (tabPath: string) => navigate(tabHref(layer, projectId, tabPath));
  const goMenu = (menuKey: string) => {
    const target = MENUS[layer].find((m) => m.key === menuKey);
    if (target) goTab(target.tabs[0].path);
  };

  const globalActive = layer === "global" ? menu.key : "";
  const breadcrumb =
    layer === "project" ? `项目空间 / ${projectName} / ${menu.label}` : layer === "admin" ? `管理后台 / ${menu.label}` : `全局 / ${menu.label}`;

  return (
    <div className="h-screen flex flex-col bg-slate-100 text-slate-800 text-sm">
      <header className="h-12 bg-slate-900 text-slate-300 flex items-center px-4 gap-6 shrink-0">
        <button onClick={() => navigate("/dashboard")} className="flex items-center gap-2 text-white font-semibold">
          <div className="w-6 h-6 rounded bg-blue-600 grid place-items-center text-xs">AI</div>
          测试开发平台 <span className="text-[10px] font-normal px-1.5 rounded bg-blue-600/30 text-blue-300">Enterprise</span>
        </button>
        <nav className="flex gap-1 h-full">
          {globalMenus.map((m) => (
            <button key={m.key} onClick={() => navigate(tabHref("global", projectId, m.tabs[0].path))} className={cx("px-3 h-full text-xs border-b-2", globalActive === m.key ? "border-blue-500 text-white" : "border-transparent hover:text-white")}>
              {m.label}
            </button>
          ))}
          <button onClick={() => navigate(projectId ? `/project/${projectId}/overview` : "/dashboard")} className={cx("px-3 h-full text-xs border-b-2", layer === "project" ? "border-blue-500 text-white" : "border-transparent hover:text-white")}>项目空间</button>
          {isAdmin && <button onClick={() => navigate("/admin/models/providers")} className={cx("px-3 h-full text-xs border-b-2", layer === "admin" ? "border-blue-500 text-white" : "border-transparent hover:text-white")}>管理后台</button>}
        </nav>
        <div className="flex-1" />
        <ProjectSwitcher />
        <NotificationCenter />
        <div className="flex items-center gap-2 text-xs">
          <div className="w-7 h-7 rounded-full bg-blue-500 text-white grid place-items-center">{(user?.name ?? "?").slice(0, 1)}</div>
          <span>{user?.name ?? "未登录"} · {user?.role ?? "-"}</span>
          <button onClick={() => { void logout().then(() => navigate("/login")); }} className="text-slate-300 hover:text-white">退出</button>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        <aside className="w-52 bg-white border-r border-slate-200 overflow-y-auto shrink-0">
          <div className="px-4 py-3 text-[11px] uppercase tracking-wider text-slate-500">
            {layer === "global" ? "全局" : layer === "project" ? projectName : "管理员"}
          </div>
          {layerMenus.map((m) => (
            <button key={m.key} onClick={() => goMenu(m.key)} className={cx("w-full text-left px-4 py-2 text-xs border-l-2", menu.key === m.key ? "border-blue-600 bg-blue-50 text-blue-700 font-medium" : "border-transparent text-slate-600 hover:bg-slate-50")}>
              {m.label}
            </button>
          ))}
        </aside>

        <main className="flex-1 overflow-y-auto">
          <div className="bg-white border-b border-slate-200 px-6 pt-3">
            <div className="text-[11px] text-slate-500">{breadcrumb}</div>
            <h1 className="text-base font-semibold mt-0.5">{menu.label}</h1>
            {menu.tabs.length > 1 ? (
              <div className="flex gap-5 mt-2">
                {menu.tabs.map((t) => (
                  <button key={t.label} onClick={() => goTab(t.path)} className={cx("pb-2 text-xs border-b-2", activeTab === t.label ? "border-blue-600 text-blue-600 font-medium" : "border-transparent text-slate-500 hover:text-slate-800")}>
                    {t.label}
                  </button>
                ))}
              </div>
            ) : (
              <div className="h-3" />
            )}
          </div>
          <div className="p-6 pb-16">
            <Suspense fallback={<div className="h-40 grid place-items-center text-xs text-slate-500">加载中…</div>}>
              <Outlet />
            </Suspense>
          </div>
        </main>
      </div>

      <TaskDock />
      <ToastStack items={toasts} />
    </div>
  );
}
