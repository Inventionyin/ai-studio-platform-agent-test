import { useEffect, useRef, useState } from "react";
import { testcasesApi } from "@/api";
import type { CaseReviewItem, TestCase } from "@/api/types";
import { useAsync } from "@/hooks/useAsync";
import { useApp } from "@/store/app";
import { downloadBlob } from "@/lib/download";
import { Btn, Card, Empty, Field, Input, Select, Tag, Textarea } from "@/components/ui";
import { cx } from "@/lib/cx";

const EMPTY = { title: "", priority: "P1" as TestCase["priority"], precondition: "", steps: "", expected: "" };

export function CaseReview() {
  const { data, setData, loading, reload } = useAsync(async () => {
    const [reviews, cases] = await Promise.all([testcasesApi.reviewQueue(), testcasesApi.list()]);
    return { reviews, cases };
  }, [], { reviews: [] as CaseReviewItem[], cases: [] as TestCase[] });
  const [selected, setSelected] = useState(0);
  const [comment, setComment] = useState("");
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useApp();

  const item = data.reviews[selected];
  const testCase = data.cases.find((candidate) => candidate.id === item?.caseId);

  useEffect(() => {
    if (!testCase) return;
    setForm({
      title: testCase.title,
      priority: testCase.priority,
      precondition: testCase.precondition,
      steps: testCase.steps.join("\n"),
      expected: testCase.expected,
    });
  }, [testCase?.id]);

  const decide = async (action: "通过" | "驳回") => {
    if (!item) return;
    setBusy(true);
    try {
      if (testCase) {
        await testcasesApi.update(testCase.id, {
          title: form.title,
          priority: form.priority,
          precondition: form.precondition,
          steps: form.steps.split("\n").map((step) => step.trim()).filter(Boolean),
          expected: form.expected,
        });
      }
      await testcasesApi.review(item.caseId, action, comment);
      await reload();
      setComment("");
      toast(action === "通过" ? "已保存并同步用例状态" : "已驳回并记录意见");
    } catch (err) {
      toast(err instanceof Error ? err.message : "操作失败");
    } finally {
      setBusy(false);
    }
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
      toast(`导入完成：新增 ${result.created}，更新 ${result.updated}${result.errors.length ? `，${result.errors.length} 行错误` : ""}`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "导入失败");
    }
  };

  if (loading) return <div className="h-40 grid place-items-center text-xs text-slate-500">加载中…</div>;

  return (
    <div className="grid grid-cols-3 gap-4">
      <Card title="评审队列">
        <div className="flex gap-2 mb-3">
          <Btn v="ghost" onClick={exportExcel}>导出 Excel</Btn>
          <Btn v="ghost" onClick={() => fileRef.current?.click()}>导入 Excel</Btn>
          <input ref={fileRef} type="file" accept=".xlsx" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) void importExcel(file); e.target.value = ""; }} />
        </div>
        {data.reviews.length === 0 && <Empty text="暂无待评审用例" />}
        {data.reviews.map((review, index) => (
          <button key={review.caseId} onClick={() => setSelected(index)} className={cx("w-full flex justify-between items-center px-2 py-2 rounded text-xs", selected === index && "bg-blue-50")}>
            <span className="truncate pr-2">{review.title}</span><Tag t={review.status} />
          </button>
        ))}
      </Card>

      <Card title={item ? item.title : "评审详情"} className="col-span-2">
        {!item || !testCase ? (
          <Empty />
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3">
              <Field label="标题" className="col-span-2"><Input className="w-full" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
              <Field label="优先级"><Select opts={["P0", "P1", "P2"]} className="w-full" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as TestCase["priority"] })} /></Field>
              <Field label="模块"><Input className="w-full" value={testCase.module} readOnly /></Field>
              <Field label="类型"><Input className="w-full" value={testCase.type} readOnly /></Field>
              <Field label="来源"><Input className="w-full" value={testCase.source} readOnly /></Field>
              <Field label="前置条件" className="col-span-3"><Input className="w-full" value={form.precondition} onChange={(e) => setForm({ ...form, precondition: e.target.value })} /></Field>
              <Field label="测试步骤" hint="每行一个步骤" className="col-span-3"><Textarea className="w-full h-28" value={form.steps} onChange={(e) => setForm({ ...form, steps: e.target.value })} /></Field>
              <Field label="预期结果" className="col-span-3"><Textarea className="w-full h-20" value={form.expected} onChange={(e) => setForm({ ...form, expected: e.target.value })} /></Field>
              <Field label="评审意见" className="col-span-3"><Textarea className="w-full h-20" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="填写评审意见…" /></Field>
            </div>

            <div className="flex gap-2 mt-3">
              <Btn onClick={() => decide("通过")} disabled={busy || item.status !== "待评审"}>{busy ? "处理中…" : "通过并保存"}</Btn>
              <Btn v="ghost" onClick={() => decide("驳回")} disabled={busy || item.status !== "待评审"}>驳回</Btn>
            </div>

            <div className="mt-4 border-t pt-3">
              <div className="text-xs font-medium mb-2">评审记录</div>
              {item.comments.length === 0 && <div className="text-xs text-slate-500">暂无记录</div>}
              {item.comments.map((entry) => (
                <div key={entry.id} className="text-xs text-slate-500 py-1.5 border-b border-slate-100 last:border-0">
                  <span className="text-slate-700">{entry.author || "系统"}</span> · {entry.action} · {entry.content}
                  <span className="ml-2 text-slate-500">{entry.time}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
