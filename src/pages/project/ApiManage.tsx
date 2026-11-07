import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { apiTestApi } from "@/api";
import type { ApiEndpoint, HttpMethod } from "@/api/types";
import { useAsync } from "@/hooks/useAsync";
import { useApp } from "@/store/app";
import { confirmDelete } from "@/lib/confirm";
import { Btn, Card, Field, Input, Modal, Select, Table, Textarea, Toolbar } from "@/components/ui";
import { cx } from "@/lib/cx";

const METHODS: HttpMethod[] = ["GET", "POST", "PUT", "DELETE", "PATCH"];
const SAMPLE_YAML = `openapi: 3.0.3
info:
  title: 会员中心 API
  version: 1.0.0
paths:
  /api/v1/member/profile:
    get:
      summary: 获取会员信息
  /api/v1/member/points:
    get:
      summary: 积分明细
  /api/v1/member/benefits/{id}/claim:
    post:
      summary: 领取权益`;

export function ApiManage() {
  const { data, setData } = useAsync(() => apiTestApi.definitions(), [], [] as ApiEndpoint[]);
  const { projectId, toast } = useApp();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const imported = params.get("imported") === "1";
  const [module, setModule] = useState("全部");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [yaml, setYaml] = useState("");
  const [form, setForm] = useState({ method: "GET" as HttpMethod, path: "", name: "", module: "用户" });

  const modules = ["全部", ...Array.from(new Set(data.map((d) => d.module)))];
  const list = data.filter((d) => (module === "全部" || d.module === module) && (!query || d.path.includes(query) || d.summary.includes(query)));
  const importedCount = data.filter((d) => d.source === "AI 导入" || d.source === "OpenAPI 导入").length;

  const create = async () => {
    if (!form.path.trim() || !form.name.trim()) { toast("请填写路径与名称"); return; }
    const item = await apiTestApi.create(form);
    setData([item, ...data]);
    setOpen(false);
    setForm({ method: "GET", path: "", name: "", module: "用户" });
    toast("接口已创建");
  };

  const doImport = async () => {
    try {
      const added = await apiTestApi.importYaml(yaml || SAMPLE_YAML);
      const fresh = await apiTestApi.definitions();
      setData(fresh);
      setImportOpen(false);
      setYaml("");
      toast(`已导入 ${added.length} 个接口`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "导入失败");
    }
  };

  const remove = async (id: string) => {
    const target = data.find((x) => x.id === id);
    if (!confirmDelete(target?.path ?? id)) return;
    await apiTestApi.remove(id);
    setData(data.filter((d) => d.id !== id));
    toast("接口已删除");
  };

  return (
    <div className="space-y-3">
      {imported && <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs rounded-md px-4 py-2">{importedCount ? `已从「接口设计生成」导入 ${importedCount} 个接口定义` : "接口已存在，未新增"}</div>}
      <div className="grid grid-cols-4 gap-4">
        <Card title="接口目录">
          {modules.map((d) => (
            <button key={d} onClick={() => setModule(d)} className={cx("w-full text-left py-1.5 text-xs hover:text-blue-600", module === d && "text-blue-600 font-medium")}>
              ▸ {d} <span className="text-slate-500">({d === "全部" ? data.length : data.filter((x) => x.module === d).length})</span>
            </button>
          ))}
        </Card>
        <Card className="col-span-3">
          <Toolbar placeholder="搜索路径/名称" onSearch={setQuery} filters={<span />}>
            <Btn v="ghost" onClick={() => setImportOpen(true)}>导入 OpenAPI</Btn>
            <Btn onClick={() => setOpen(true)}>+ 新建接口</Btn>
          </Toolbar>
          <Table
            cols={["方法", "路径", "名称", "状态", "创建人"]}
            rows={list.map((d) => [
              d.method,
              <code key="p">{d.path}</code>,
              d.summary,
              d.status,
              d.creator,
            ])}
            actions={(i) => (
              <>
                <Btn v="ghost" onClick={() => navigate(`/project/${projectId}/api/debug?path=${encodeURIComponent(list[i].path)}&method=${list[i].method}`)}>调试</Btn>
                <Btn v="danger" onClick={() => remove(list[i].id)}>删除</Btn>
              </>
            )}
          />
        </Card>
      </div>

      <Modal open={open} title="新建接口" onClose={() => setOpen(false)} footer={<><Btn v="ghost" onClick={() => setOpen(false)}>取消</Btn><Btn onClick={create}>创建</Btn></>}>
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <Field label="方法"><Select opts={METHODS} className="w-full" value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value as HttpMethod })} /></Field>
            <Field label="模块"><Input className="w-full" value={form.module} onChange={(e) => setForm({ ...form, module: e.target.value })} /></Field>
            <Field label="名称"><Input className="w-full" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          </div>
          <Field label="路径"><Input className="w-full font-mono" value={form.path} onChange={(e) => setForm({ ...form, path: e.target.value })} placeholder="/api/v1/..." /></Field>
        </div>
      </Modal>

      <Modal open={importOpen} title="导入 OpenAPI" onClose={() => setImportOpen(false)} width="max-w-2xl" footer={<><Btn v="ghost" onClick={() => setYaml(SAMPLE_YAML)}>填入示例</Btn><Btn v="ghost" onClick={() => setImportOpen(false)}>取消</Btn><Btn onClick={doImport}>解析并导入</Btn></>}>
        <Field label="OpenAPI 3.0 YAML" hint="仅解析 paths 下的接口定义，已存在的同方法同路径会跳过">
          <Textarea className="w-full h-72 font-mono text-[11px]" value={yaml} onChange={(e) => setYaml(e.target.value)} placeholder="粘贴 OpenAPI 3.0 文档…" spellCheck={false} />
        </Field>
      </Modal>
    </div>
  );
}
