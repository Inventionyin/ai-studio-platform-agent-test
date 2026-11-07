import { useState } from "react";
import { cx } from "@/lib/cx";
import { diffLines } from "@/lib/diff";

export function VersionDiff({ left, right, leftLabel = "旧版本", rightLabel = "新版本" }: { left: string; right: string; leftLabel?: string; rightLabel?: string }) {
  const [onlyChanges, setOnlyChanges] = useState(false);
  const lines = diffLines(left, right);
  const added = lines.filter((l) => l.type === "add").length;
  const removed = lines.filter((l) => l.type === "del").length;
  const visible = onlyChanges ? lines.filter((l) => l.type !== "same") : lines;

  return (
    <div className="text-xs">
      <div className="flex items-center gap-3 mb-2">
        <span className="text-slate-500">{leftLabel} → {rightLabel}</span>
        <span className="text-emerald-600">+{added}</span>
        <span className="text-rose-600">-{removed}</span>
        <label className="ml-auto flex items-center gap-1 text-slate-500">
          <input type="checkbox" checked={onlyChanges} onChange={(e) => setOnlyChanges(e.target.checked)} />
          仅看变更
        </label>
      </div>
      <div className="border rounded-md overflow-hidden font-mono text-[11px] leading-5 max-h-[520px] overflow-y-auto bg-white">
        {visible.length === 0 && <div className="p-4 text-slate-500 text-center">两个版本内容一致</div>}
        {visible.map((l, i) => (
          <div key={i} className={cx("px-2 whitespace-pre-wrap break-all", l.type === "add" ? "bg-emerald-50 text-emerald-800" : l.type === "del" ? "bg-rose-50 text-rose-800" : "text-slate-600")}>
            <span className="inline-block w-4 select-none text-slate-500">{l.type === "add" ? "+" : l.type === "del" ? "-" : " "}</span>
            {l.text || " "}
          </div>
        ))}
      </div>
    </div>
  );
}
