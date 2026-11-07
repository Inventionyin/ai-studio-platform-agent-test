import { useState } from "react";
import { webuiApi } from "@/api";
import type { UiElement, UiPage } from "@/api/types";
import { useAsync } from "@/hooks/useAsync";
import { useApp } from "@/store/app";
import { confirmDelete } from "@/lib/confirm";
import { Btn, Card, Field, Input, Modal, Select, Table } from "@/components/ui";

export function ElementLibrary() {
  const { data, setData } = useAsync(async () => {
    const [pages, elements] = await Promise.all([webuiApi.pages(), webuiApi.elements()]);
    return { pages, elements };
  }, [], { pages: [] as UiPage[], elements: [] as UiElement[] });
  const [page, setPage] = useState("全部页面");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ pageId: "", name: "", selectorType: "CSS" as UiElement["selectorType"], selectorValue: "" });
  const { toast } = useApp();

  const list = data.elements.filter((e) => page === "全部页面" || e.pageName === page);

  const add = async () => {
    if (!form.pageId || !form.name || !form.selectorValue) { toast("请填写页面、元素名称与定位值"); return; }
    await webuiApi.addElement(form);
    setData({ ...data, elements: await webuiApi.elements() });
    setOpen(false);
    setForm({ pageId: "", name: "", selectorType: "CSS", selectorValue: "" });
    toast("元素已添加");
  };

  const remove = async (id: string) => {
    const target = data.elements.find((x) => x.id === id);
    if (!confirmDelete(target?.name ?? id)) return;
    await webuiApi.removeElement(id);
    setData({ ...data, elements: data.elements.filter((e) => e.id !== id) });
    toast("元素已删除");
  };

  return (
    <>
      <div className="grid grid-cols-4 gap-4">
        <Card title="页面">
          {data.pages.map((p) => (
            <button key={p.id} onClick={() => setPage(p.name)} className={`w-full text-left py-2 text-xs border-b last:border-0 ${page === p.name ? "text-blue-600 font-medium" : "hover:text-blue-600"}`}>
              <div>{p.name}</div>
              <div className="text-[11px] text-slate-500 font-mono">{p.url}</div>
            </button>
          ))}
          <button onClick={() => setPage("全部页面")} className={`w-full text-left py-2 text-xs ${page === "全部页面" ? "text-blue-600 font-medium" : "text-slate-500"}`}>全部页面</button>
        </Card>

        <Card title="元素库" className="col-span-3" extra={<Btn onClick={() => { setForm({ ...form, pageId: data.pages[0]?.id ?? "" }); setOpen(true); }}>+ 新增元素</Btn>}>
          <Table
            cols={["页面", "元素", "定位方式", "定位值"]}
            rows={list.map((e) => [e.pageName, e.name, e.selectorType, <code key="v" className="text-[11px]">{e.selectorValue}</code>])}
            actions={(i) => (
              <>
                <Btn v="ghost" onClick={() => { void navigator.clipboard?.writeText(list[i].selectorValue); toast("定位值已复制"); }}>复制</Btn>
                <Btn v="danger" onClick={() => remove(list[i].id)}>删除</Btn>
              </>
            )}
          />
        </Card>
      </div>

      <Modal open={open} title="新增元素" onClose={() => setOpen(false)} footer={<><Btn v="ghost" onClick={() => setOpen(false)}>取消</Btn><Btn onClick={add}>保存</Btn></>}>
        <div className="space-y-3">
          <Field label="所属页面">
            <Select opts={data.pages.map((p) => p.name)} className="w-full" value={data.pages.find((p) => p.id === form.pageId)?.name ?? ""} onChange={(e) => setForm({ ...form, pageId: data.pages.find((p) => p.name === e.target.value)?.id ?? "" })} />
          </Field>
          <Field label="元素名称"><Input className="w-full" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="例如：登录按钮" /></Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="定位方式"><Select opts={["CSS", "XPath", "Text"]} className="w-full" value={form.selectorType} onChange={(e) => setForm({ ...form, selectorType: e.target.value as UiElement["selectorType"] })} /></Field>
            <Field label="定位值" className="col-span-2"><Input className="w-full font-mono" value={form.selectorValue} onChange={(e) => setForm({ ...form, selectorValue: e.target.value })} placeholder="#username 或 //button" /></Field>
          </div>
        </div>
      </Modal>
    </>
  );
}
