import { del, get, post, upload } from "./http";
import type { KbDocument, KnowledgeBase, RecallHit } from "./types";

export const knowledgeApi = {
  list: () => get<KnowledgeBase[]>("/knowledge"),
  create: (input: { name: string; description: string; embedding: string }) => post<KnowledgeBase>("/knowledge", input),
  remove: (id: string) => del<null>(`/knowledge/${encodeURIComponent(id)}`),
  docs: (kbId?: string) => get<KbDocument[]>(`/knowledge/docs${kbId ? `?kbId=${encodeURIComponent(kbId)}` : ""}`),
  upload: (kbId: string, file: File) => {
    const form = new FormData();
    form.append("kbId", kbId);
    form.append("file", file);
    return upload<KbDocument>("/knowledge/docs", form);
  },
  reparse: (docId: string) => post<KbDocument>(`/knowledge/docs/${encodeURIComponent(docId)}/reparse`),
  removeDoc: (id: string) => del<null>(`/knowledge/docs/${encodeURIComponent(id)}`),
  chunks: (docId: string) => get<{ index: number; content: string }[]>(`/knowledge/docs/${encodeURIComponent(docId)}/chunks`),
  recall: (query: string, topK = 5) => post<RecallHit[]>("/knowledge/recall", { query, topK }),
};
