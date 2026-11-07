import { useState } from "react";
import type { Prototype } from "@/api/types";
import { Btn, Field, Input, Modal, Textarea } from "@/components/ui";
import { cx } from "@/lib/cx";

function emptyPrototype(): Prototype {
  return { flow: "", pages: [{ name: "页面 1", sections: [{ name: "区域 1", items: ["内容"] }] }] };
}

export function PrototypeEditor({ prototype, onClose, onSave }: {
  prototype: Prototype;
  onClose: () => void;
  onSave: (prototype: Prototype) => void;
}) {
  const [draft, setDraft] = useState<Prototype>(() => JSON.parse(JSON.stringify(prototype)));
  const [mode, setMode] = useState<"form" | "json">("form");
  const [json, setJson] = useState(() => JSON.stringify(prototype, null, 2));
  const [error, setError] = useState("");

  const apply = () => {
    try {
      const parsed = mode === "json" ? (JSON.parse(json) as Prototype) : draft;
      if (!parsed.pages?.length) throw new Error("至少保留一个页面");
      onSave(parsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "格式错误");
    }
  };

  const switchMode = (next: "form" | "json") => {
    if (next === "json") setJson(JSON.stringify(draft, null, 2));
    else {
      try {
        setDraft(JSON.parse(json) as Prototype);
      } catch {
        setError("JSON 格式错误，无法切换到表单");
        return;
      }
    }
    setError("");
    setMode(next);
  };

  return (
    <Modal open title="编辑原型结构" onClose={onClose} width="max-w-3xl" footer={<><Btn v="ghost" onClick={onClose}>取消</Btn><Btn onClick={apply}>保存</Btn></>}>
      <div className="flex gap-2 mb-3">
        <button onClick={() => switchMode("form")} className={cx("px-3 h-7 rounded text-xs", mode === "form" ? "bg-blue-600 text-white" : "border border-slate-300")}>表单编辑</button>
        <button onClick={() => switchMode("json")} className={cx("px-3 h-7 rounded text-xs", mode === "json" ? "bg-blue-600 text-white" : "border border-slate-300")}>JSON</button>
      </div>
      {error && <div className="text-xs text-rose-600 mb-2">{error}</div>}
      {mode === "json" ? (
        <Textarea className="w-full h-[480px] font-mono text-[11px]" value={json} onChange={(e) => setJson(e.target.value)} spellCheck={false} />
      ) : (
        <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
          <Field label="页面流程"><Input className="w-full" value={draft.flow} onChange={(e) => setDraft({ ...draft, flow: e.target.value })} /></Field>
          {draft.pages.map((page, pageIndex) => (
            <div key={pageIndex} className="border border-slate-200 rounded-md p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Input value={page.name} onChange={(e) => {
                  const pages = [...draft.pages];
                  pages[pageIndex] = { ...page, name: e.target.value };
                  setDraft({ ...draft, pages });
                }} className="flex-1" />
                <Btn v="danger" onClick={() => setDraft({ ...draft, pages: draft.pages.filter((_, i) => i !== pageIndex) })} disabled={draft.pages.length <= 1}>删除页面</Btn>
              </div>
              {page.sections.map((section, sectionIndex) => (
                <div key={sectionIndex} className="border-l-2 border-slate-200 pl-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Input value={section.name} onChange={(e) => {
                      const pages = [...draft.pages];
                      const sections = [...page.sections];
                      sections[sectionIndex] = { ...section, name: e.target.value };
                      pages[pageIndex] = { ...page, sections };
                      setDraft({ ...draft, pages });
                    }} className="flex-1" />
                    <Btn v="danger" onClick={() => {
                      const pages = [...draft.pages];
                      pages[pageIndex] = { ...page, sections: page.sections.filter((_, i) => i !== sectionIndex) };
                      setDraft({ ...draft, pages });
                    }}>删除区域</Btn>
                  </div>
                  <Textarea className="w-full h-20" value={section.items.join("\n")} onChange={(e) => {
                    const pages = [...draft.pages];
                    const sections = [...page.sections];
                    sections[sectionIndex] = { ...section, items: e.target.value.split("\n") };
                    pages[pageIndex] = { ...page, sections };
                    setDraft({ ...draft, pages });
                  }} placeholder="每行一个元素" />
                </div>
              ))}
              <Btn v="ghost" onClick={() => {
                const pages = [...draft.pages];
                pages[pageIndex] = { ...page, sections: [...page.sections, { name: "新区域", items: ["内容"] }] };
                setDraft({ ...draft, pages });
              }}>+ 区域</Btn>
            </div>
          ))}
          <Btn v="ghost" onClick={() => setDraft({ ...draft, pages: [...draft.pages, { name: `页面 ${draft.pages.length + 1}`, sections: [{ name: "区域 1", items: ["内容"] }] }] })}>+ 页面</Btn>
        </div>
      )}
    </Modal>
  );
}
