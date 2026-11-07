import { useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { knowledgeApi } from "@/api";
import type { KbDocument, KnowledgeBase } from "@/api/types";
import { useAsync } from "@/hooks/useAsync";
import { useApp } from "@/store/app";
import { confirmDelete } from "@/lib/confirm";
import { Btn, Card, Drawer, Field, Modal, Select, Table, Tag, Toolbar } from "@/components/ui";

export function Documents() {
  const [params] = useSearchParams();
  const { data, setData } = useAsync(async () => {
    const [kbs, docs] = await Promise.all([knowledgeApi.list(), knowledgeApi.docs()]);
    return { kbs, docs };
  }, [], { kbs: [] as KnowledgeBase[], docs: [] as KbDocument[] });
  const [kbId, setKbId] = useState(params.get("kb") ?? "全部知识库");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploadKb, setUploadKb] = useState("");
  const [chunks, setChunks] = useState<{ index: number; content: string }[]>([]);
  const [chunkTitle, setChunkTitle] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { addTask, toast } = useApp();

  const kbName = (id: string) => data.kbs.find((k) => k.id === id)?.name ?? id;
  const list = data.docs.filter((d) => (kbId === "全部知识库" || kbName(d.kbId) === kbId) && (!query || d.filename.includes(query)));

  const upload = async () => {
    if (!uploadKb || !file) { toast("请选择知识库与文件"); return; }
    addTask(`知识库解析 · ${file.name}`, "解析");
    try {
      await knowledgeApi.upload(uploadKb, file);
      setData({ ...data, docs: await knowledgeApi.docs(), kbs: await knowledgeApi.list() });
      setOpen(false);
      setFile(null);
      toast("文档已解析并写入知识库");
    } catch (err) {
      toast(err instanceof Error ? err.message : "上传失败");
    }
  };

  const reparse = async (doc: KbDocument) => {
    setBusy(doc.id);
    addTask(`文档重新解析 · ${doc.filename}`, "解析");
    await knowledgeApi.reparse(doc.id);
    setData({ ...data, docs: await knowledgeApi.docs(), kbs: await knowledgeApi.list() });
    setBusy(null);
    toast("解析完成，切片已写入向量库");
  };

  const viewChunks = async (doc: KbDocument) => {
    setChunkTitle(doc.filename);
    setChunks(await knowledgeApi.chunks(doc.id));
  };

  const remove = async (id: string) => {
    const target = data.docs.find((x) => x.id === id);
    if (!confirmDelete(target?.filename ?? id)) return;
    await knowledgeApi.removeDoc(id);
    setData({ ...data, docs: data.docs.filter((d) => d.id !== id) });
    toast("文档已删除");
  };

  return (
    <>
      <Card>
        <Toolbar placeholder="搜索文档名称" onSearch={setQuery} filters={<Select opts={["全部知识库", ...data.kbs.map((k) => k.name)]} value={kbId} onChange={(e) => setKbId(e.target.value)} />}>
          <Btn onClick={() => { setUploadKb(data.kbs[0]?.id ?? ""); setOpen(true); }}>+ 上传文档</Btn>
        </Toolbar>
        <Table
          cols={["文档", "所属知识库", "大小", "解析状态", "切片数", "上传时间"]}
          rows={list.map((d) => [d.filename, kbName(d.kbId), typeof d.size === "number" ? `${Math.max(1, Math.round(d.size / 1024))}KB` : d.size, d.parseStatus, String(d.chunks), d.uploadedAt])}
          actions={(i) => (
            <>
              <Btn v="ghost" onClick={() => viewChunks(list[i])}>查看分段</Btn>
              <Btn v="ghost" disabled={busy === list[i].id} onClick={() => reparse(list[i])}>{busy === list[i].id ? "解析中…" : "重新解析"}</Btn>
              <Btn v="danger" onClick={() => remove(list[i].id)}>删除</Btn>
            </>
          )}
        />
      </Card>

      <Modal open={open} title="上传文档" onClose={() => setOpen(false)} footer={<><Btn v="ghost" onClick={() => setOpen(false)}>取消</Btn><Btn onClick={upload}>上传</Btn></>}>
        <div className="space-y-3">
          <Field label="目标知识库"><Select opts={data.kbs.map((k) => k.name)} className="w-full" value={kbName(uploadKb)} onChange={(e) => setUploadKb(data.kbs.find((k) => k.name === e.target.value)?.id ?? "")} /></Field>
          <div className="border border-dashed border-slate-300 rounded-lg p-6 text-center text-xs text-slate-500">
            <div className="mb-2">支持 PDF / Word / Markdown / TXT</div>
            <Btn v="ghost" onClick={() => fileRef.current?.click()}>选择文件</Btn>
            <input ref={fileRef} type="file" accept=".pdf,.docx,.md,.markdown,.txt" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            {file && <div className="mt-3 text-slate-700">已选择：{file.name}</div>}
          </div>
        </div>
      </Modal>

      <Drawer open={chunks.length > 0} title={`文档分段 · ${chunkTitle}`} onClose={() => setChunks([])} width="w-[560px]">
        <div className="space-y-3">
          {chunks.map((c) => (
            <div key={c.index} className="border rounded-md p-3 text-xs">
              <div className="flex justify-between mb-1"><span className="text-slate-500">段落 {c.index}</span><Tag t="已嵌入" c="green" /></div>
              <div className="text-slate-700 leading-relaxed">{c.content}</div>
            </div>
          ))}
        </div>
      </Drawer>
    </>
  );
}
