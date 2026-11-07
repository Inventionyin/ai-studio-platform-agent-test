import { useState } from "react";
import { agentTestApi, type AgentFixInput } from "@/api";
import type { AgentRun, FixRecord } from "@/api/types";
import { useAsync } from "@/hooks/useAsync";
import { useApp } from "@/store/app";
import { Btn, Card, Empty, Field, Input, Modal, Select, Table, Tag, Textarea } from "@/components/ui";
import { errorText, fixLabel, fixTone, fmtTime, pretty, runLabel, runTone } from "./agentTestUtils";

const SEVERITIES = ["P0", "P1", "P2"];
const CATEGORIES = ["prompt", "tool", "retrieval", "model", "data", "code", "environment"];
const FIX_TARGETS = ["agent", "platform", "test_data"];

interface FixFormState {
  runId: string;
  title: string;
  severity: string;
  category: string;
  fixTarget: string;
  symptom: string;
  rootCause: string;
  fixAction: string;
}

const emptyForm = (runId = ""): FixFormState => ({
  runId,
  title: "",
  severity: "P1",
  category: "prompt",
  fixTarget: "agent",
  symptom: "",
  rootCause: "",
  fixAction: "",
});

export function AgentFixPanel({ selectedRunId }: { selectedRunId: string | null }) {
  const { toast } = useApp();
  const { data: fixes, loading, reload } = useAsync(() => agentTestApi.fixes(), [], [] as FixRecord[]);
  const { data: runs } = useAsync(() => agentTestApi.runs(), [], [] as AgentRun[]);
  const [form, setForm] = useState<FixFormState | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [regressionFix, setRegressionFix] = useState<FixRecord | null>(null);
  const [afterRunId, setAfterRunId] = useState("");
  const [regressing, setRegressing] = useState(false);
  const [docLoading, setDocLoading] = useState<string | null>(null);
  const [comparison, setComparison] = useState<{ title: string; beforeStatus: string; afterStatus: string; detail: unknown } | null>(null);

  const failedRuns = runs.filter((run) => run.status === "fail" || run.status === "error" || run.status === "needs_review");
  const runStatus = (id: string | null) => runs.find((run) => run.id === id)?.status ?? "";

  const openCreate = () => {
    const preferred = selectedRunId && failedRuns.some((run) => run.id === selectedRunId)
      ? selectedRunId
      : failedRuns[0]?.id ?? "";
    if (!preferred) {
      toast("当前没有失败运行，无法创建修复工单");
      return;
    }
    setEditingId(null);
    setForm(emptyForm(preferred));
  };

  const openEdit = (fix: FixRecord) => {
    setEditingId(fix.id);
    setForm({
      runId: fix.runId,
      title: fix.title,
      severity: fix.severity,
      category: fix.category,
      fixTarget: fix.fixTarget,
      symptom: fix.symptom,
      rootCause: fix.rootCause,
      fixAction: fix.fixAction,
    });
  };

  const save = async () => {
    if (!form) return;
    if (!form.title.trim()) {
      toast("请填写问题名称");
      return;
    }
    setSaving(true);
    try {
      const payload: AgentFixInput = {
        runId: form.runId,
        title: form.title.trim(),
        severity: form.severity,
        category: form.category,
        fixTarget: form.fixTarget,
        symptom: form.symptom,
        rootCause: form.rootCause,
        fixAction: form.fixAction,
      };
      if (editingId) await agentTestApi.updateFix(editingId, payload);
      else await agentTestApi.createFix(payload);
      const updated = Boolean(editingId);
      setForm(null);
      setEditingId(null);
      reload();
      toast(updated ? "修复工单已更新" : "修复工单已创建");
    } catch (error) {
      toast(errorText(error));
    } finally {
      setSaving(false);
    }
  };

  const runRegression = async () => {
    if (!regressionFix || !afterRunId) {
      toast("请选择用于回归的 Run");
      return;
    }
    setRegressing(true);
    try {
      const result = await agentTestApi.regression(regressionFix.id, afterRunId);
      setComparison({
        title: regressionFix.title,
        beforeStatus: result.before.run.status,
        afterStatus: result.after.run.status,
        detail: result.comparison,
      });
      setRegressionFix(null);
      setAfterRunId("");
      reload();
      toast("回归完成");
    } catch (error) {
      toast(errorText(error));
    } finally {
      setRegressing(false);
    }
  };

  const generateDoc = async (fix: FixRecord) => {
    setDocLoading(fix.id);
    try {
      const updated = await agentTestApi.generateDoc(fix.id);
      reload();
      toast(`经验文档已生成：${updated.docPath ?? updated.slug}`);
    } catch (error) {
      toast(errorText(error));
    } finally {
      setDocLoading(null);
    }
  };

  return (
    <div className="space-y-4">
      <Card
        title="修复工单"
        extra={(
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-500">{fixes.length} 条</span>
            <Btn onClick={openCreate} disabled={saving}>新建修复工单</Btn>
          </div>
        )}
      >
        {loading && fixes.length === 0 ? (
          <Empty text="加载修复工单…" className="h-32" />
        ) : (
          <Table
            cols={["问题", "严重级", "分类", "状态", "回归 Run", "文档"]}
            rows={fixes.map((fix) => [
              <span key="title" className="block max-w-64 truncate font-medium text-slate-800" title={fix.title}>{fix.title}</span>,
              <Tag key="severity" t={fix.severity} />,
              <span key="category" className="text-slate-600">{fix.category}</span>,
              <Tag key="status" t={fixLabel(fix.status)} c={fixTone(fix.status)} />,
              <span key="after" className="font-mono text-[11px] text-slate-500">{fix.afterRunId ? fix.afterRunId.slice(0, 16) : "-"}</span>,
              fix.docPath ? <Tag key="doc" t="已生成" c="green" /> : <span key="doc" className="text-slate-400">-</span>,
            ])}
            actions={(index) => {
              const fix = fixes[index];
              return (
                <>
                  <Btn v="ghost" onClick={() => openEdit(fix)} disabled={saving}>编辑</Btn>
                  <Btn v="ghost" onClick={() => { setRegressionFix(fix); setAfterRunId(""); }} disabled={regressing || docLoading !== null}>回归</Btn>
                  <Btn v="ghost" onClick={() => void generateDoc(fix)} disabled={docLoading !== null}>
                    {docLoading === fix.id ? "生成中…" : "生成文档"}
                  </Btn>
                </>
              );
            }}
            empty="暂无修复工单，可从失败运行创建"
          />
        )}
        <div className="mt-2 text-[11px] text-slate-500">
          创建时会默认带入当前选中的失败运行；编辑时可补充根因与修复动作，回归后生成经验文档。
        </div>
      </Card>

      {comparison && (
        <Card title={`回归结果 · ${comparison.title}`} extra={<Btn v="ghost" onClick={() => setComparison(null)}>关闭</Btn>}>
          <div className="mb-2 flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5 text-slate-500">修复前 <Tag t={runLabel(comparison.beforeStatus)} c={runTone(comparison.beforeStatus)} /></span>
            <span className="flex items-center gap-1.5 text-slate-500">修复后 <Tag t={runLabel(comparison.afterStatus)} c={runTone(comparison.afterStatus)} /></span>
          </div>
          <pre className="max-h-56 overflow-auto rounded-md bg-slate-900 p-3 text-[11px] leading-5 text-emerald-300 whitespace-pre-wrap break-words">
            {pretty(comparison.detail)}
          </pre>
        </Card>
      )}

      <Modal
        open={form !== null}
        title={editingId ? "编辑修复工单" : "新建修复工单"}
        width="max-w-2xl"
        onClose={() => { if (!saving) { setForm(null); setEditingId(null); } }}
        footer={(
          <>
            <Btn v="ghost" disabled={saving} onClick={() => { setForm(null); setEditingId(null); }}>取消</Btn>
            <Btn disabled={saving || !form?.title.trim()} onClick={() => void save()}>{saving ? "保存中…" : "保存"}</Btn>
          </>
        )}
      >
        {form && (
          <div className="space-y-3">
            <Field label="问题名称">
              <Input className="w-full" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </Field>
            <div className="grid grid-cols-4 gap-3">
              <Field label="关联失败 Run" className="col-span-2">
                <select
                  className="h-8 px-2 rounded-md border border-slate-300 text-xs bg-white w-full"
                  value={form.runId}
                  onChange={(e) => setForm({ ...form, runId: e.target.value })}
                >
                  {!failedRuns.some((run) => run.id === form.runId) && form.runId && <option value={form.runId}>{form.runId}</option>}
                  {failedRuns.map((run) => <option key={run.id} value={run.id}>{run.id} · {runLabel(run.status)}</option>)}
                </select>
              </Field>
              <Field label="严重级">
                <Select className="w-full" opts={SEVERITIES} value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })} />
              </Field>
              <Field label="分类">
                <Select className="w-full" opts={CATEGORIES} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="修复对象">
                <Select className="w-full" opts={FIX_TARGETS} value={form.fixTarget} onChange={(e) => setForm({ ...form, fixTarget: e.target.value })} />
              </Field>
              <Field label="现象">
                <Input className="w-full" value={form.symptom} onChange={(e) => setForm({ ...form, symptom: e.target.value })} />
              </Field>
            </div>
            <Field label="根因">
              <Textarea className="w-full h-20" value={form.rootCause} onChange={(e) => setForm({ ...form, rootCause: e.target.value })} />
            </Field>
            <Field label="修复动作">
              <Textarea className="w-full h-20" value={form.fixAction} onChange={(e) => setForm({ ...form, fixAction: e.target.value })} />
            </Field>
          </div>
        )}
      </Modal>

      <Modal
        open={regressionFix !== null}
        title={regressionFix ? `回归验证 · ${regressionFix.title}` : "回归验证"}
        onClose={() => { if (!regressing) setRegressionFix(null); }}
        footer={(
          <>
            <Btn v="ghost" disabled={regressing} onClick={() => setRegressionFix(null)}>取消</Btn>
            <Btn disabled={regressing || !afterRunId} onClick={() => void runRegression()}>{regressing ? "回归中…" : "开始回归"}</Btn>
          </>
        )}
      >
        <div className="space-y-3">
          <div className="text-[11px] text-slate-500">
            修复前运行：<span className="font-mono text-slate-700">{regressionFix?.beforeRunId ?? regressionFix?.runId ?? "-"}</span>
            <span className="ml-3">状态：<Tag t={runLabel(runStatus(regressionFix?.beforeRunId ?? regressionFix?.runId ?? null))} c={runTone(runStatus(regressionFix?.beforeRunId ?? regressionFix?.runId ?? null))} /></span>
          </div>
          <Field label="选择修复后的 Run">
            <select
              className="h-8 px-2 rounded-md border border-slate-300 text-xs bg-white w-full"
              value={afterRunId}
              onChange={(e) => setAfterRunId(e.target.value)}
            >
              <option value="">请选择 Run</option>
              {runs.map((run) => <option key={run.id} value={run.id}>{run.id} · {runLabel(run.status)} · {fmtTime(run.startedAt)}</option>)}
            </select>
          </Field>
          <div className="text-[11px] text-slate-500">回归会对比修复前后两次运行的判定结果，并将工单状态更新为已验证。</div>
        </div>
      </Modal>
    </div>
  );
}
