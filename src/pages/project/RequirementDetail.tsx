import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { apiTestApi, requirementsApi, tasksApi } from "@/api";
import type { GenerationResult, Prototype, Requirement, VersionSnapshot } from "@/api/types";
import { useAsync } from "@/hooks/useAsync";
import { useApp } from "@/store/app";
import { downloadBlob, downloadText } from "@/lib/download";
import { prototypeToSvg } from "@/lib/prototypeSvg";
import { MODELS } from "@/config/constants";
import { cx } from "@/lib/cx";
import { Btn, Card, Drawer, Field, Input, Modal, Progress, Select, Tag, Textarea } from "@/components/ui";
import { MonacoEditor, PrototypeEditor, PrototypeRenderer, RequirementSplit, VersionDiff } from "@/components/business";

const STAGES = ["检索知识库", "需求拆解", "结构生成", "校验", "完成"];

export function RequirementDetail() {
  const { rid = "" } = useParams<{ rid: string }>();
  const { data: req, setData: setReq } = useAsync<Requirement | null>(() => requirementsApi.get(rid).then((r) => r ?? null), [rid], null);
  const { data: versions } = useAsync(() => tasksApi.versions(), [], [] as VersionSnapshot[]);
  const { data: children } = useAsync(() => req ? requirementsApi.children(req.id) : Promise.resolve([]), [req?.id, req?.splitStatus], [] as Requirement[]);
  const { projectId, addTask, toast } = useApp();
  const navigate = useNavigate();
  const [sub, setSub] = useState<"原型图" | "接口设计">("原型图");
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [editorOpen, setEditorOpen] = useState(false);
  const [diffOpen, setDiffOpen] = useState(false);
  const [yamlDraft, setYamlDraft] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ filename: string; text: string } | null>(null);
  const [reqOpen, setReqOpen] = useState(false);
  const [reqForm, setReqForm] = useState({
    title: "",
    priority: "P1" as Requirement["priority"],
    owner: "",
    status: "",
    description: "",
  });

  if (!req) return <div className="h-40 grid place-items-center text-xs text-slate-500">加载中…</div>;

  const p = progress[sub] ?? -1;
  const latest = (kind: GenerationResult["kind"]) => req.generations.find((g) => g.kind === kind);
  const proto = req.prototype;
  const yaml = yamlDraft ?? req.apiYaml ?? "";
  const endpoints = latest("api")?.endpoints ?? [];
  const checks = latest(sub === "原型图" ? "prototype" : "api")?.checks ?? [];
  const hasContent = sub === "原型图" ? !!proto : !!req.apiYaml;
  const showContent = p === 100 || (p < 0 && hasContent);

  const run = async () => {
    if (p >= 0 && p < 100) return;
    setProgress((m) => ({ ...m, [sub]: 0 }));
    addTask(`${sub}生成 · ${req.title}`);
    const timer = window.setInterval(() => {
      setProgress((m) => ({ ...m, [sub]: Math.min(90, (m[sub] ?? 0) + 8) }));
    }, 160);
    try {
      await requirementsApi.generate(req.id, sub === "原型图" ? "prototype" : "api");
      const fresh = await requirementsApi.get(req.id);
      if (fresh) setReq(fresh);
      setProgress((m) => ({ ...m, [sub]: 100 }));
      setYamlDraft(null);
      toast(`${sub}生成完成`);
    } catch (e) {
      setProgress((m) => ({ ...m, [sub]: -1 }));
      toast(e instanceof Error ? e.message : "生成失败");
    } finally {
      window.clearInterval(timer);
    }
  };

  const savePrototype = async (prototype: Prototype) => {
    try {
      setReq(await requirementsApi.savePrototype(req.id, prototype));
      setEditorOpen(false);
      toast("原型结构已保存");
    } catch (e) {
      toast(e instanceof Error ? e.message : "保存失败");
    }
  };

  const saveYaml = async () => {
    setReq(await requirementsApi.saveYaml(req.id, yaml));
    toast("OpenAPI 文档已保存");
  };

  const exportPng = async () => {
    if (!proto) return;
    const { svg, width, height } = prototypeToSvg(proto);
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    try {
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("render failed"));
        img.src = url;
      });
      const scale = 2;
      const canvas = document.createElement("canvas");
      canvas.width = width * scale;
      canvas.height = height * scale;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("canvas unavailable");
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      await new Promise<void>((resolve) => {
        canvas.toBlob((blob) => {
          if (blob) downloadBlob(`${req.id}-prototype.png`, blob);
          resolve();
        }, "image/png");
      });
      toast("已导出原型图（PNG）");
    } catch {
      toast("导出 PNG 失败");
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  const importApi = async () => {
    if (!yaml.trim()) { toast("请先生成接口设计"); return; }
    try {
      const added = await apiTestApi.importYaml(yaml, "会员");
      toast(added.length ? `已导入 ${added.length} 个接口` : "接口已存在，未新增");
      navigate(`/project/${projectId}/api?imported=1`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "导入失败");
    }
  };

  const previewFile = async (fileId: string) => {
    try {
      const result = await requirementsApi.fileText(req.id, fileId);
      setPreview(result);
    } catch (e) {
      toast(e instanceof Error ? e.message : "预览失败");
    }
  };

  const openReqEdit = () => {
    setReqForm({ title: req.title, priority: req.priority, owner: req.owner, status: req.status, description: req.description });
    setReqOpen(true);
  };

  const saveReq = async () => {
    if (!reqForm.title.trim()) { toast("请输入需求名称"); return; }
    try {
      setReq(await requirementsApi.update(req.id, reqForm));
      setReqOpen(false);
      toast("需求信息已保存");
    } catch (e) {
      toast(e instanceof Error ? e.message : "保存失败");
    }
  };

  const downloadFile = async (fileId: string, filename: string) => {
    try {
      const blob = await requirementsApi.downloadFile(req.id, fileId);
      downloadBlob(filename, blob);
    } catch (e) {
      toast(e instanceof Error ? e.message : "下载失败");
    }
  };

  const diffKind = sub === "原型图" ? "原型结构" : "接口设计";
  const diffPair = versions.filter((v) => v.kind === diffKind).slice(-2);

  return (
    <div className="grid grid-cols-4 gap-4">
      <Card title="需求信息" extra={<Btn v="ghost" onClick={openReqEdit}>编辑</Btn>}>
        <dl className="text-xs space-y-1.5">
          {[["编号", req.id], ["名称", req.title], ["优先级", req.priority], ["负责人", req.owner || "-"], ["版本", req.version], ["状态", req.status]].map(([label, value]) => (
            <div key={label} className="flex justify-between gap-3"><dt className="text-slate-500">{label}</dt><dd className="text-right">{value}</dd></div>
          ))}
        </dl>
        <p className="text-xs text-slate-600 mt-3 leading-relaxed border-t pt-3 max-h-28 overflow-y-auto">{req.description}</p>
        {req.parentId && (
          <button onClick={() => navigate(`/project/${projectId}/requirements/${req.parentId}`)} className="mt-2 text-[11px] text-blue-600">← 返回主需求</button>
        )}
        {req.files && req.files.length > 0 && (
          <div className="mt-3 pt-3 border-t">
            <div className="text-[11px] text-slate-500 mb-1">需求文档（{req.files.length}）</div>
            {req.files.map((file) => (
              <div key={file.id} className="flex items-center justify-between gap-2 py-1 text-[11px]">
                <span className="truncate">{file.filename}</span>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => previewFile(file.id)} className="text-blue-600">预览</button>
                  <button onClick={() => downloadFile(file.id, file.filename)} className="text-blue-600">下载</button>
                </div>
              </div>
            ))}
          </div>
        )}
        {req.points.length > 0 && (
          <div className="mt-3 pt-3 border-t">
            <div className="text-[11px] text-slate-500 mb-1">AI 需求拆解</div>
            {req.points.map((point) => <div key={point} className="text-xs py-0.5">· {point}</div>)}
          </div>
        )}
        <div className="mt-3 pt-3 border-t"><RequirementSplit requirement={req} onUpdated={setReq} /></div>
        {children.length > 0 && (
          <div className="mt-3 pt-3 border-t">
            <div className="text-[11px] text-slate-500 mb-1">子需求（{children.length}）</div>
            {children.map((child) => (
              <button key={child.id} onClick={() => navigate(`/project/${projectId}/requirements/${child.id}`)} className="w-full flex justify-between gap-2 py-1 text-xs hover:text-blue-600">
                <span className="truncate">{child.title}</span><Tag t={child.priority} />
              </button>
            ))}
          </div>
        )}
      </Card>

      <Card title="AI 设计生成" className="col-span-3" extra={<span className="text-[11px] text-slate-500">由工作流模板「需求→{sub === "原型图" ? "原型" : "接口"}」驱动</span>}>
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          {(["原型图", "接口设计"] as const).map((s) => (
            <button key={s} onClick={() => setSub(s)} className={cx("px-3 h-8 rounded-md text-xs", sub === s ? "bg-blue-50 text-blue-700 font-medium" : "text-slate-500 hover:bg-slate-50")}>{s}</button>
          ))}
          <div className="flex-1" />
          <Btn v="ghost" onClick={() => navigate(`/project/${projectId}/testcases/generate?requirement=${encodeURIComponent(req.id)}&source=${encodeURIComponent("需求文档")}`)}>生成测试用例</Btn>
          <Select opts={MODELS} />
          <Btn onClick={run} disabled={p >= 0 && p < 100}>{p >= 0 && p < 100 ? "生成中…" : p === 100 ? "重新生成" : `生成${sub}`}</Btn>
        </div>

        {p >= 0 && p < 100 && (
          <div className="mb-4">
            <div className="text-xs text-slate-500 mb-1">任务进度 {p}% · {STAGES[Math.min(4, Math.floor(p / 25))]}</div>
            <Progress value={p} />
          </div>
        )}

        {!showContent ? (
          <div className="h-72 grid place-items-center text-xs text-slate-500 border border-dashed rounded-lg">点击“生成{sub}”开始，产物将在此预览</div>
        ) : sub === "原型图" ? (
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">{proto && <PrototypeRenderer prototype={proto} />}</div>
            <div className="space-y-3">
              <div className="text-xs font-medium">校验结果</div>
              {checks.map((check) => <div key={check.label} className="text-xs flex gap-2"><Tag t={check.status} />{check.label}</div>)}
              <div className="flex flex-wrap gap-2 pt-3 border-t">
                <Btn v="ghost" onClick={() => setEditorOpen(true)}>编辑结构</Btn>
                <Btn v="ghost" onClick={() => setDiffOpen(true)}>版本对比</Btn>
                <Btn v="ghost" onClick={exportPng}>导出 PNG</Btn>
                <Btn onClick={() => navigate(`/project/${projectId}/testcases/generate?requirement=${encodeURIComponent(req.id)}&source=${encodeURIComponent("原型图")}`)}>作为用例输入</Btn>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2"><MonacoEditor value={yaml} onChange={setYamlDraft} language="yaml" height={360} path={`${req.id}.yaml`} /></div>
            <div className="space-y-3">
              <div className="text-xs font-medium">接口清单（{endpoints.length}）</div>
              {endpoints.map((endpoint) => (
                <div key={endpoint.id} className="text-xs flex gap-2 items-center"><Tag t={endpoint.method} c={endpoint.method === "GET" ? "blue" : "green"} /><code className="truncate">{endpoint.path}</code></div>
              ))}
              {checks.map((check) => <div key={check.label} className="text-xs flex gap-2"><Tag t={check.status} />{check.label}</div>)}
              <div className="flex flex-wrap gap-2 pt-3 border-t">
                <Btn v="ghost" onClick={() => setDiffOpen(true)}>版本对比</Btn>
                <Btn v="ghost" onClick={saveYaml}>保存修改</Btn>
                <Btn v="ghost" onClick={() => { downloadText(`${req.id}.yaml`, yaml, "text/yaml;charset=utf-8"); toast("已导出 YAML"); }}>导出 YAML</Btn>
                <Btn onClick={importApi}>导入到 API 测试</Btn>
              </div>
            </div>
          </div>
        )}
      </Card>

      {editorOpen && proto && <PrototypeEditor prototype={proto} onClose={() => setEditorOpen(false)} onSave={savePrototype} />}

      <Modal open={reqOpen} title="编辑需求信息" onClose={() => setReqOpen(false)} footer={<><Btn v="ghost" onClick={() => setReqOpen(false)}>取消</Btn><Btn onClick={saveReq}>保存</Btn></>}>
        <div className="space-y-3">
          <Field label="需求名称"><Input className="w-full" value={reqForm.title} onChange={(e) => setReqForm({ ...reqForm, title: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="优先级"><Select opts={["P0", "P1", "P2"]} className="w-full" value={reqForm.priority} onChange={(e) => setReqForm({ ...reqForm, priority: e.target.value as Requirement["priority"] })} /></Field>
            <Field label="负责人"><Input className="w-full" value={reqForm.owner} onChange={(e) => setReqForm({ ...reqForm, owner: e.target.value })} /></Field>
            <Field label="状态"><Select opts={["待解析", "解析中", "已解析", "待评审", "已完成", "已驳回"]} className="w-full" value={reqForm.status} onChange={(e) => setReqForm({ ...reqForm, status: e.target.value })} /></Field>
          </div>
          <Field label="需求描述"><Textarea className="w-full h-32" value={reqForm.description} onChange={(e) => setReqForm({ ...reqForm, description: e.target.value })} /></Field>
        </div>
      </Modal>

      <Drawer open={!!preview} title={preview ? `文档预览 · ${preview.filename}` : ""} onClose={() => setPreview(null)} width="w-[720px]">
        <pre className="whitespace-pre-wrap text-[11px] leading-relaxed text-slate-700">{preview?.text}</pre>
      </Drawer>

      <Modal open={diffOpen} title={`版本对比 · ${diffKind}`} onClose={() => setDiffOpen(false)} width="max-w-3xl">
        {diffPair.length >= 2 ? (
          <VersionDiff left={diffPair[0].content} right={diffPair[1].content} leftLabel={diffPair[0].version} rightLabel={diffPair[1].version} />
        ) : (
          <div className="h-32 grid place-items-center text-xs text-slate-500">暂无足够版本可对比，请先生成两次产物</div>
        )}
      </Modal>
    </div>
  );
}
