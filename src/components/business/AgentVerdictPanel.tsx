import { useState } from "react";
import type { AgentEvaluateInput } from "@/api";
import type { EvaluatorType, RunDetail } from "@/api/types";
import { useApp } from "@/store/app";
import { Btn, Card, Field, Table, Tag, Textarea } from "@/components/ui";
import { errorText, evaluatorLabel, verdictLabel, verdictTone } from "./agentTestUtils";

const EVALUATORS: EvaluatorType[] = ["rule", "llm", "human"];

export function AgentVerdictPanel({ detail, busy, onEvaluate }: {
  detail: RunDetail;
  busy: boolean;
  onEvaluate: (input: AgentEvaluateInput) => Promise<void>;
}) {
  const { toast } = useApp();
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState<"pass" | "fail" | null>(null);

  const submit = async (verdict: "pass" | "fail") => {
    setSubmitting(verdict);
    try {
      await onEvaluate({ evaluatorType: "human", verdict, comment: comment.trim() || undefined });
      setComment("");
    } catch (error) {
      toast(errorText(error));
    } finally {
      setSubmitting(null);
    }
  };

  const checks = detail.evaluations.flatMap((evaluation) =>
    (evaluation.checks ?? []).map((check) => ({ evaluator: evaluation.evaluatorType, check })),
  );

  return (
    <Card title="判定结果" extra={<span className="text-[11px] text-slate-500">{detail.evaluations.length} 条</span>}>
      <div className="space-y-3">
        {EVALUATORS.map((type) => {
          const list = detail.evaluations.filter((item) => item.evaluatorType === type);
          return (
            <div key={type} className="space-y-1.5">
              <div className="text-[11px] font-medium text-slate-500">{evaluatorLabel(type)}</div>
              {list.length === 0 ? (
                <div className="text-[11px] text-slate-400">暂无记录</div>
              ) : (
                list.map((item) => (
                  <div key={item.id} className="rounded-md border border-slate-100 bg-slate-50/60 px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Tag t={verdictLabel(item.verdict)} c={verdictTone(item.verdict)} />
                      {item.score != null && <span className="text-[11px] text-slate-500">得分 {(item.score * 100).toFixed(0)}%</span>}
                      {item.model && <span className="text-[11px] text-slate-500">{item.model}</span>}
                      <span className="text-[11px] text-slate-400">{item.createdBy ?? ""}</span>
                    </div>
                    {item.comment && <div className="mt-1 text-[11px] leading-5 text-slate-600">{item.comment}</div>}
                  </div>
                ))
              )}
            </div>
          );
        })}

        <div>
          <div className="mb-1 text-[11px] font-medium text-slate-500">检查明细</div>
          {checks.length === 0 ? (
            <div className="text-[11px] text-slate-400">暂无检查项</div>
          ) : (
            <Table
              cols={["判定", "检查项", "结果", "说明", "证据"]}
              rows={checks.map(({ evaluator, check }) => [
                <span key="evaluator" className="text-slate-600">{evaluatorLabel(evaluator)}</span>,
                <span key="label" className="text-slate-700">{check.label}</span>,
                <Tag key="passed" t={check.passed ? "通过" : "失败"} c={check.passed ? "green" : "red"} />,
                <span key="detail" className="block max-w-56 truncate text-slate-500" title={check.detail}>{check.detail || "-"}</span>,
                <span key="evidence" className="text-[11px] text-slate-500">{check.evidenceSpanIds?.join(", ") || "-"}</span>,
              ])}
            />
          )}
        </div>

        <div className="space-y-2 border-t border-slate-100 pt-3">
          <Field label="人工评审意见">
            <Textarea
              className="w-full h-16"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="填写判定依据或需要修复的问题"
            />
          </Field>
          <div className="flex gap-2">
            <Btn disabled={busy || submitting !== null} onClick={() => void submit("pass")}>
              {submitting === "pass" ? "提交中…" : "人工通过"}
            </Btn>
            <Btn v="danger" disabled={busy || submitting !== null} onClick={() => void submit("fail")}>
              {submitting === "fail" ? "提交中…" : "人工失败"}
            </Btn>
          </div>
        </div>
      </div>
    </Card>
  );
}
