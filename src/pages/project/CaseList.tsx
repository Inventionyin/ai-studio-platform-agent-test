import { useRef, useState } from "react";
import { testcasesApi } from "@/api";
import type { TestCase } from "@/api/types";
import { useAsync } from "@/hooks/useAsync";
import { useApp } from "@/store/app";
import { useAuth } from "@/store/auth";
import { confirmDelete } from "@/lib/confirm";
import { downloadBlob } from "@/lib/download";
import { Btn, Card, Field, Input, Modal, Select, Table, Textarea, Toolbar } from "@/components/ui";
import { DetailDrawer } from "@/components/business";

const EMPTY = { title: "", module: "会员", type: "正向", priority: "P1" as TestCase["priority"], precondition: "", steps: "", expected: "" };

export function CaseList() {
  const { data, setData, reload } = useAsync(() => testcasesApi.list(), [], [] as TestCase[]);
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("全部状态");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TestCase | null>(null);
  const [detail, setDetail] = useState<TestCase | null>(null);
  const [form, setForm] = useState(EMPTY);
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useApp();

  const list = data.filter((c) => (status === "全部状态" || c.status === status) && (!query || c.title.includes(query) || c.id.includes(query)));

  const openCreate = () => { setEditing(null); setForm(EMPTY); setOpen(true); };
  const openEdit = (c: TestCase) => {
    setEditing(c);
    setForm({ title: c.title, module: c.module, type: c.type, priority: c.priority, precondition: c.precondition, steps: c.steps.join("\n"), expected: c.expected });
    setOpen(true);
  };

  const save = async () => {
    if (!form.title.trim()) { toast("请填写用例标题"); return; }
    const payload = { ...form, steps: form.steps.split("\n").map((s) => s.trim()).filter(Boolean) };
    if (editing) {
      const updated = await testcasesApi.update(editing.id, payload);
      setData(data.map((c) => (c.id === updated.id ? updated : c)));
      toast("用例已更新");
    } else {
      const created = await testcasesApi.create({ ...payload, source: "手工", owner: user?.name ?? "" });
      setData([created, ...data]);
      toast("用例已创建");
    }
    setOpen(false);
  };

  const remove = async (id: string) => {
    const target = data.find((x) => x.id === id);
    if (!confirmDelete(target?.title ?? id)) return;
    await testcasesApi.remove(id);
    setData(data.filter((c) => c.id !== id));
    toast("用例已删除");
  };

  const exportExcel = async () => {
    try {
      downloadBlob("testcases.xlsx", await testcasesApi.exportXlsx());
      toast("已导出 Excel");
    } catch (err) {
      toast(err instanceof Error ? err.message : "导出失败");
    }
  };

  const importExcel = async (file: File) => {
    try {
      const result = await testcasesApi.importXlsx(file);
      await reload();
      toast(`导入完成：新增 ${result.created}，更新 ${result.updated}`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "导入失败");
    }
  };

  return (
    <>
      <Card>
        <Toolbar placeholder="搜索用例标题/编号" onSearch={setQuery} onStatusChange={setStatus} statusOptions={["全部状态", "通过", "待评审", "草稿"]}>
          <Btn v="ghost" onClick={exportExcel}>导出 Excel</Btn>
          <Btn v="ghost" onClick={() => fileRef.current?.click()}>导入 Excel</Btn>
          <input ref={fileRef} type="file" accept=".xlsx" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) void importExcel(file); e.target.value = ""; }} />
          <Btn onClick={openCreate}>+ 新建用例</Btn>
        </Toolbar>
        <Table
          cols={["ID", "标题", "模块", "类型", "优先级", "状态", "版本"]}
          rows={list.map((c) => [c.id, c.title, c.module, c.type, c.priority, c.status, c.version])}
          onRowClick={(i) => setDetail(list[i])}
          actions={(i) => (
            <>
              <Btn v="ghost" onClick={() => openEdit(list[i])}>编辑</Btn>
              <Btn v="danger" onClick={() => remove(list[i].id)}>删除</Btn>
            </>
          )}
        />
      </Card>

      <Modal open={open} title={editing ? `编辑用例 · ${editing.id}` : "新建用例"} onClose={() => setOpen(false)} width="max-w-2xl" footer={<><Btn v="ghost" onClick={() => setOpen(false)}>取消</Btn><Btn onClick={save}>保存</Btn></>}>
        <div className="space-y-3">
          <Field label="标题"><Input className="w-full" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} autoFocus /></Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="模块"><Input className="w-full" value={form.module} onChange={(e) => setForm({ ...form, module: e.target.value })} /></Field>
            <Field label="类型"><Select opts={["正向", "边界", "异常", "安全"]} className="w-full" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} /></Field>
            <Field label="优先级"><Select opts={["P0", "P1", "P2"]} className="w-full" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as TestCase["priority"] })} /></Field>
          </div>
          <Field label="前置条件"><Input className="w-full" value={form.precondition} onChange={(e) => setForm({ ...form, precondition: e.target.value })} /></Field>
          <Field label="测试步骤" hint="每行一个步骤"><Textarea className="w-full h-28" value={form.steps} onChange={(e) => setForm({ ...form, steps: e.target.value })} /></Field>
          <Field label="预期结果"><Textarea className="w-full h-20" value={form.expected} onChange={(e) => setForm({ ...form, expected: e.target.value })} /></Field>
        </div>
      </Modal>

      <DetailDrawer
        open={!!detail}
        title={detail ? `${detail.id} · ${detail.title}` : ""}
        onClose={() => setDetail(null)}
        fields={detail ? [
          { label: "模块", value: detail.module },
          { label: "类型", value: detail.type },
          { label: "优先级", value: detail.priority },
          { label: "状态", value: detail.status },
          { label: "版本", value: detail.version },
          { label: "来源", value: detail.source },
          { label: "负责人", value: detail.owner },
          { label: "更新时间", value: detail.updatedAt },
        ] : []}
      >
        {detail && (
          <div className="text-xs space-y-3">
            <div><div className="text-slate-500 mb-1">前置条件</div><div>{detail.precondition || "无"}</div></div>
            <div><div className="text-slate-500 mb-1">测试步骤</div><ol className="list-decimal pl-4 space-y-1">{detail.steps.map((s, i) => <li key={i}>{s}</li>)}</ol></div>
            <div><div className="text-slate-500 mb-1">预期结果</div><div>{detail.expected}</div></div>
          </div>
        )}
      </DetailDrawer>
    </>
  );
}
