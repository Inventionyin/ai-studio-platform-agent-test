import { useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { requirementsApi } from "@/api";
import type { Requirement } from "@/api/types";
import { useAsync } from "@/hooks/useAsync";
import { useApp } from "@/store/app";
import { confirmDelete } from "@/lib/confirm";
import { Btn, Card, Field, Input, Modal, Select, Table, Tag, Textarea, Toolbar } from "@/components/ui";
import { cx } from "@/lib/cx";

const STATUSES = ["全部状态", "待解析", "解析中", "已解析", "待评审", "已完成", "已驳回"];

export function RequirementList() {
  const { data, setData, reload } = useAsync(() => requirementsApi.list(), [], [] as Requirement[]);
  const { projectId, addTask, toast } = useApp();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("全部状态");
  const [module, setModule] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [form, setForm] = useState({ title: "", priority: "P1" as Requirement["priority"], owner: "", description: "" });
  const [uploadTitle, setUploadTitle] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [autoSplit, setAutoSplit] = useState(true);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const roots = data.filter((item) => !item.parentId);
  const childrenOf = (parentId: string) => data.filter((item) => item.parentId === parentId);
  const moduleRoots = roots.filter((root) => childrenOf(root.id).length > 0);
  const standaloneRoots = roots.filter((root) => childrenOf(root.id).length === 0);
  const matches = (item: Requirement) =>
    (status === "全部状态" || item.status === status) &&
    (!query || item.title.includes(query) || item.id.includes(query));
  const isFiltering = query.trim() !== "" || status !== "全部状态";

  const titleCounts = roots.reduce<Record<string, number>>((acc, root) => {
    acc[root.title] = (acc[root.title] ?? 0) + 1;
    return acc;
  }, {});
  const visible = roots
    .filter((root) => !module || root.id === module)
    .map((root) => {
      const all = childrenOf(root.id);
      const rootMatch = matches(root);
      const matchedChildren = all.filter(matches);
      return { root, children: rootMatch ? all : matchedChildren, show: rootMatch || matchedChildren.length > 0 };
    })
    .filter((item) => item.show);

  const toggle = (id: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandAll = () => setExpanded(new Set(visible.filter((item) => item.children.length > 0).map((item) => item.root.id)));
  const collapseAll = () => setExpanded(new Set());

  const rows: ReactNode[][] = [];
  const targets: Requirement[] = [];
  for (const item of visible) {
    const isOpen = item.children.length > 0 && (isFiltering || expanded.has(item.root.id));
    rows.push([
      item.root.id,
      <div key="title" className="flex items-center gap-2">
        <button
          onClick={() => toggle(item.root.id)}
          disabled={childrenOf(item.root.id).length === 0}
          className={cx("w-5 h-5 rounded border grid place-items-center text-[11px] disabled:opacity-30", isOpen ? "border-blue-300 text-blue-600 bg-blue-50" : "border-slate-300 text-slate-500")}
          aria-label={isOpen ? "收起子需求" : "展开子需求"}
        >
          {isOpen ? "−" : "+"}
        </button>
        <Tag t={childrenOf(item.root.id).length > 0 ? "模块" : "独立需求"} c={childrenOf(item.root.id).length > 0 ? "blue" : "gray"} />
        <span className="font-medium truncate max-w-[460px]" title={item.root.title}>{item.root.title}</span>
      </div>,
      String(item.children.length),
      item.root.priority,
      item.root.status,
      item.root.owner || "-",
    ]);
    targets.push(item.root);
    if (isOpen) {
      for (const child of item.children) {
        rows.push([
          child.id,
          <span key="title" className="pl-8 text-slate-600 block truncate max-w-[520px]" title={child.title}>└ {child.title}</span>,
          "-",
          child.priority,
          child.status,
          child.owner || "-",
        ]);
        targets.push(child);
      }
    }
  }

  const create = async () => {
    if (!form.title.trim()) { toast("请输入需求名称"); return; }
    try {
      const requirement = await requirementsApi.create(form);
      setData([requirement, ...data]);
      setOpen(false);
      setForm({ title: "", priority: "P1", owner: form.owner, description: "" });
      toast(`需求 ${requirement.id} 已创建`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "创建失败");
    }
  };

  const upload = async () => {
    if (files.length === 0) { toast("请选择至少一个文件"); return; }
    setBusy(true);
    addTask(`需求文档解析 · ${files.length} 个文件`, "解析");
    try {
      const requirement = await requirementsApi.upload(files, uploadTitle);
      setUploadOpen(false);
      setFiles([]);
      setUploadTitle("");
      await reload();
      if (autoSplit) {
        try {
          await requirementsApi.split(requirement.id);
          toast("文档已解析，AI 已生成子需求草案");
        } catch (err) {
          toast(err instanceof Error ? err.message : "自动拆分失败，可在详情页重试");
        }
      } else {
        toast("文档已上传并解析");
      }
      navigate(`/project/${projectId}/requirements/${requirement.id}`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "上传失败");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    const target = data.find((item) => item.id === id);
    if (!confirmDelete(target?.title ?? id)) return;
    try {
      await requirementsApi.remove(id);
      setData(data.filter((item) => item.id !== id));
      toast("需求已删除");
    } catch (err) {
      toast(err instanceof Error ? err.message : "删除失败");
    }
  };

  const subCount = data.filter((item) => item.parentId).length;

  return (
    <>
      <Card>
        <div className="flex items-center gap-4 mb-3 text-xs text-slate-500">
          <span>业务模块 <b className="text-slate-800">{moduleRoots.length}</b></span>
          <span>独立需求 <b className="text-slate-800">{standaloneRoots.length}</b></span>
          <span>子需求 <b className="text-slate-800">{subCount}</b></span>
          <span>需求总数 <b className="text-slate-800">{data.length}</b></span>
          <span className="ml-auto">默认按业务模块收起，点击 +/− 展开或收起子需求</span>
        </div>
        <Toolbar
          placeholder="搜索需求名称/编号"
          onSearch={setQuery}
          filters={
            <div className="flex items-center gap-2">
              <select
                value={module}
                onChange={(e) => {
                  const value = e.target.value;
                  setModule(value);
                  if (value) setExpanded(new Set([value]));
                }}
                className="h-8 px-2 rounded-md border border-slate-300 text-xs bg-white max-w-60"
              >
                <option value="">全部需求</option>
                <optgroup label="业务模块">
                  {moduleRoots.map((root) => (
                    <option key={root.id} value={root.id}>{root.title}</option>
                  ))}
                </optgroup>
                {standaloneRoots.length > 0 && (
                  <optgroup label="独立需求 / 文档">
                    {standaloneRoots.map((root) => (
                      <option key={root.id} value={root.id}>
                        {root.title}{titleCounts[root.title] > 1 ? ` (${root.id})` : ""}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
              <Select opts={STATUSES} value={status} onChange={(e) => setStatus(e.target.value)} />
            </div>
          }
        >
          <Btn v="ghost" onClick={expandAll}>全部展开</Btn>
          <Btn v="ghost" onClick={collapseAll}>全部收起</Btn>
          <Btn v="ghost" onClick={() => setUploadOpen(true)}>上传文档</Btn>
          <Btn onClick={() => setOpen(true)}>+ 新建需求</Btn>
        </Toolbar>
        <Table
          cols={["编号", "需求名称", "子需求", "优先级", "状态", "负责人"]}
          rows={rows}
          empty="没有匹配的需求"
          actions={(i) => (
            <>
              <Btn v="ghost" onClick={() => navigate(`/project/${projectId}/requirements/${targets[i].id}`)}>详情</Btn>
              <Btn v="danger" onClick={() => remove(targets[i].id)}>删除</Btn>
            </>
          )}
        />
      </Card>

      <Modal open={open} title="新建需求" onClose={() => setOpen(false)} footer={<><Btn v="ghost" onClick={() => setOpen(false)}>取消</Btn><Btn onClick={create}>创建</Btn></>}>
        <div className="space-y-3">
          <Field label="需求名称"><Input className="w-full" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} autoFocus /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="优先级"><Select opts={["P0", "P1", "P2"]} className="w-full" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as Requirement["priority"] })} /></Field>
            <Field label="负责人"><Input className="w-full" value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })} /></Field>
          </div>
          <Field label="需求描述"><Textarea className="w-full h-24" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
        </div>
      </Modal>

      <Modal open={uploadOpen} title="上传需求文档" onClose={() => setUploadOpen(false)} footer={<><Btn v="ghost" onClick={() => setUploadOpen(false)}>取消</Btn><Btn onClick={upload} disabled={busy}>{busy ? "上传解析中…" : "上传并解析"}</Btn></>}>
        <div className="space-y-3">
          <Field label="主需求名称" hint="留空则使用第一个文件名"><Input className="w-full" value={uploadTitle} onChange={(e) => setUploadTitle(e.target.value)} /></Field>
          <div className="border border-dashed border-slate-300 rounded-lg p-6 text-center text-xs text-slate-500">
            <div className="mb-2">支持 PDF / DOCX / Markdown / TXT，可一次选择多个文件</div>
            <Btn v="ghost" onClick={() => fileRef.current?.click()}>选择文件</Btn>
            <input ref={fileRef} type="file" multiple accept=".pdf,.docx,.md,.markdown,.txt" className="hidden" onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
            {files.length > 0 && <div className="mt-3 text-slate-700">{files.map((file) => file.name).join("、")}</div>}
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={autoSplit} onChange={(e) => setAutoSplit(e.target.checked)} />上传后自动调用 AI 拆分主/子需求</label>
          <div className="text-[11px] text-slate-500">原文件会保存到服务器，解析后的文本用于生成子需求草案；确认后才创建子需求。</div>
        </div>
      </Modal>
    </>
  );
}
