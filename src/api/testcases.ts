import { del, download, get, post, put, upload } from "./http";
import type { CaseReviewItem, TestCase } from "./types";

export interface ImportResult {
  created: number;
  updated: number;
  errors: string[];
}

export const testcasesApi = {
  list: () => get<TestCase[]>("/testcases"),
  create: (input: Omit<TestCase, "id" | "updatedAt" | "version" | "status">) =>
    post<TestCase>("/testcases", input),
  update: (id: string, body: Partial<TestCase>) =>
    put<TestCase>(`/testcases/${encodeURIComponent(id)}`, body),
  remove: (id: string) => del<null>(`/testcases/${encodeURIComponent(id)}`),
  generate: (source: string, requirementId?: string) =>
    post<TestCase[]>("/testcases/generate", { source, requirementId }),
  submitReview: (cases: TestCase[]) => post<number>("/testcases/review", { cases }),
  reviewQueue: () => get<CaseReviewItem[]>("/testcases/reviews"),
  review: (caseId: string, action: "通过" | "驳回", comment: string) =>
    post<CaseReviewItem[]>(`/testcases/reviews/${encodeURIComponent(caseId)}`, { action, comment }),
  exportXlsx: () => download("/testcases/export.xlsx"),
  importXlsx: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return upload<ImportResult>("/testcases/import.xlsx", form);
  },
};
