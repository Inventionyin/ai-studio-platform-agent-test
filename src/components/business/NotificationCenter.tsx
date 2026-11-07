import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { notifications } from "@/config/notifications";
import { useApp } from "@/store/app";
import { Tag } from "@/components/ui";

export function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { projectId } = useApp();

  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="relative text-xs hover:text-white">
        通知<span className="absolute -top-1.5 -right-3 bg-rose-500 text-white text-[10px] rounded-full px-1">{notifications.length}</span>
      </button>
      {open && (
        <>
          <button className="fixed inset-0 z-40 cursor-default" aria-label="关闭通知" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-8 w-72 bg-white text-slate-700 rounded-lg shadow-xl border z-50">
            {notifications.map((n) => (
              <button
                key={n.id}
                onClick={() => { setOpen(false); navigate(`/project/${projectId}${n.to}`); }}
                className="w-full text-left px-4 py-3 border-b last:border-0 text-xs hover:bg-slate-50"
              >
                <Tag t={n.title} c={n.tone} />
                <div className="mt-1 text-slate-600">{n.detail}</div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
