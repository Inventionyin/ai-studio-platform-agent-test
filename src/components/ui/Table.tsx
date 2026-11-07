import { useState, type ChangeEvent, type ReactNode } from "react";
import { cx } from "@/lib/cx";
import { Input, Select, Tag, tone } from "./primitives";

/* ---------------- Table ---------------- */
const AUTO_TAG = /^(P\d|.*中|.*通过|.*失败|成功|在线|离线|已.*|待.*|启用|停用|正常|异常|GET|POST|PUT|DELETE|PATCH)$/;

export function Table({ cols, rows, actions, empty = "暂无数据", onRowClick }: { cols: string[]; rows: ReactNode[][]; actions?: (i: number) => ReactNode; empty?: string; onRowClick?: (i: number) => void }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-slate-50 text-slate-500 text-left">
            {cols.map((c) => <th key={c} className="px-3 py-2 font-medium whitespace-nowrap">{c}</th>)}
            {actions && <th className="px-3 py-2 font-medium text-right whitespace-nowrap">操作</th>}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={cols.length + (actions ? 1 : 0)} className="px-3 py-10 text-center text-slate-500">{empty}</td></tr>
          )}
          {rows.map((r, i) => (
            <tr key={i} onClick={onRowClick ? () => onRowClick(i) : undefined} className={cx("border-t border-slate-100 hover:bg-blue-50/40", onRowClick && "cursor-pointer")}>
              {r.map((c, j) => (
                <td key={j} className="px-3 py-2.5 text-slate-700 whitespace-nowrap">
                  {typeof c === "string" && AUTO_TAG.test(c) ? <Tag t={c} c={tone(c)} /> : c}
                </td>
              ))}
              {actions && <td className="px-3 py-2.5 text-right space-x-1 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>{actions(i)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------------- Toolbar ---------------- */
export function Toolbar({ children, placeholder = "搜索名称/ID", onSearch, filters, statusOptions = ["全部状态", "进行中", "已完成", "失败"], onStatusChange }: {
  children?: ReactNode;
  placeholder?: string;
  onSearch?: (v: string) => void;
  filters?: ReactNode;
  statusOptions?: string[];
  onStatusChange?: (v: string) => void;
}) {
  const [q, setQ] = useState("");
  return (
    <div className="flex items-center gap-2 mb-3">
      <Input
        placeholder={placeholder}
        className="w-56"
        value={q}
        onChange={(e) => { setQ(e.target.value); onSearch?.(e.target.value); }}
      />
      {filters ?? <Select opts={statusOptions} onChange={(e: ChangeEvent<HTMLSelectElement>) => onStatusChange?.(e.target.value)} />}
      <div className="flex-1" />
      {children}
    </div>
  );
}
