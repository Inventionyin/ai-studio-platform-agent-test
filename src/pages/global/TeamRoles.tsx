import { useState } from "react";
import { teamApi } from "@/api";
import type { Role } from "@/api/types";
import { useAsync } from "@/hooks/useAsync";
import { useApp } from "@/store/app";
import { Btn, Card, Tag } from "@/components/ui";

const ALL_PERMISSIONS = ["只读查看", "需求管理", "生成任务", "用例编辑", "用例评审", "执行测试", "产物查看", "意见记录", "项目管理", "成员管理", "模型配置", "审计查看"];

export function TeamRoles() {
  const { data, setData } = useAsync(() => teamApi.roles(), [], [] as Role[]);
  const [draft, setDraft] = useState<Record<string, string[]>>({});
  const { toast } = useApp();

  const permsOf = (r: Role) => draft[r.name] ?? r.permissions;
  const toggle = (r: Role, perm: string) => {
    const current = permsOf(r);
    setDraft({ ...draft, [r.name]: current.includes(perm) ? current.filter((p) => p !== perm) : [...current, perm] });
  };
  const save = async (r: Role) => {
    setData(await teamApi.savePermissions(r.name, permsOf(r)));
    setDraft((d) => { const next = { ...d }; delete next[r.name]; return next; });
    toast(`${r.name}权限已保存`);
  };

  return (
    <div className="grid grid-cols-2 gap-4">
      {data.map((r) => {
        const active = permsOf(r);
        return (
          <Card key={r.name} title={r.name} extra={<span className="text-[11px] text-slate-500">{r.memberCount} 名成员</span>}>
            <div className="text-xs text-slate-500 mb-3">{r.description}</div>
            <div className="grid grid-cols-2 gap-y-2 gap-x-3">
              {ALL_PERMISSIONS.map((p) => (
                <label key={p} className="flex items-center gap-2 text-xs text-slate-600">
                  <input type="checkbox" checked={active.includes(p)} onChange={() => toggle(r, p)} />
                  {p}
                </label>
              ))}
            </div>
            <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100">
              <div className="flex gap-1 flex-wrap">
                {active.slice(0, 3).map((p) => <Tag key={p} t={p} c="blue" />)}
                {active.length > 3 && <span className="text-[11px] text-slate-500">+{active.length - 3}</span>}
              </div>
              <Btn v="ghost" disabled={!draft[r.name]} onClick={() => save(r)}>保存</Btn>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
