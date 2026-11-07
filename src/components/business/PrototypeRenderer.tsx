import { useState } from "react";
import type { Prototype } from "@/api/types";
import { Btn } from "@/components/ui";
import { cx } from "@/lib/cx";

export function PrototypeRenderer({ prototype, className }: { prototype: Prototype; className?: string }) {
  const [index, setIndex] = useState(0);
  const pages = prototype.pages ?? [];
  const page = pages[index] ?? pages[0];
  const total = pages.length;

  return (
    <div className={className ?? "bg-slate-50 rounded-lg p-4 border"}>
      {total > 1 && (
        <div className="flex items-center gap-1 mb-3 overflow-x-auto">
          {pages.map((item, i) => (
            <button
              key={`${item.name}-${i}`}
              onClick={() => setIndex(i)}
              className={cx("px-2.5 h-7 rounded text-[11px] whitespace-nowrap border", i === index ? "bg-blue-600 text-white border-blue-600" : "bg-white border-slate-300 text-slate-600")}
            >
              {i + 1}. {item.name}
            </button>
          ))}
        </div>
      )}

      <div className="mx-auto w-72 bg-white border-2 border-slate-300 rounded-2xl p-3 space-y-2">
        {page?.sections.map((section) => (
          <div key={section.name} className="border border-dashed border-slate-400 rounded p-2">
            <div className="text-[10px] text-slate-500 mb-1">{section.name}</div>
            <div className="flex flex-wrap gap-1">
              {section.items.map((item) => <span key={item} className="px-2 py-1 bg-slate-100 rounded text-[10px]">{item}</span>)}
            </div>
          </div>
        ))}
        {!page && <div className="h-32 grid place-items-center text-[11px] text-slate-500">暂无页面结构</div>}
      </div>

      <div className="mt-3 flex items-center justify-center gap-3 text-[11px] text-slate-500">
        {total > 1 && <Btn v="ghost" className="h-7" onClick={() => setIndex((current) => Math.max(0, current - 1))} disabled={index === 0}>上一页</Btn>}
        <span>{total > 0 ? `${index + 1} / ${total}` : "0 / 0"} · {prototype.flow}</span>
        {total > 1 && <Btn v="ghost" className="h-7" onClick={() => setIndex((current) => Math.min(total - 1, current + 1))} disabled={index >= total - 1}>下一页</Btn>}
      </div>
    </div>
  );
}
