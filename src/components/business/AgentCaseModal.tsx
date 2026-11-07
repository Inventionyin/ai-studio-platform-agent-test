import { useEffect, useState } from "react";
import { agentTestApi, type AgentCaseInput } from "@/api";
import type { AgentCase, AgentCheckRule, AgentTarget, CasePriority } from "@/api/types";
import { useApp } from "@/store/app";
import { Btn, Field, Input, Modal, Select, Textarea } from "@/components/ui";
import { errorText } from "./agentTestUtils";

const INPUT_TYPES = ["text", "json", "cli"];
const PRIORITIES: CasePriority[] = ["P0", "P1", "P2"];

interface CaseFormState {
  name: string;
  targetId: string;
  inputType: string;
  command: string;
  turns: string;
  expected: string;
  checks: string;
  priority: CasePriority;
}

const emptyCase = (): CaseFormState => ({
  name: "",
  targetId: "",
  inputType: "text",
  command: "",
  turns: "",
  expected: "{}",
  checks: "[]",
  priority: "P1",
});

function parseObject(text: string, label: string): Record<string, unknown> {
  if (!text.trim()) return {};
  const parsed: unknown = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(`${label}必须是 JSON 对象`);
  return parsed as Record<string, unknown>;
}

function parseChecks(text: string): AgentCheckRule[] {
  if (!text.trim()) return [];
  const parsed: unknown = JSON.parse(text);
  if (!Array.isArray(parsed) || parsed.some((item) => !item || typeof item !== "object" || typeof (item as { type?: unknown }).type !== "string")) {
    throw new Error("规则必须是 JSON 数组，且每一项包含 type");
  }
  return parsed as AgentCheckRule[];
}

function parseTurns(text: string): string[] {
  return text.split("\n").map((line) => line.trim()).filter(Boolean);
}

export function AgentCaseModal({ open, item, targets, onClose, onSaved }: {
  open: boolean;
  item: AgentCase | null;
  targets: AgentTarget[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useApp();
  const [form, setForm] = useState<CaseFormState>(emptyCase);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSaving(false);
    setForm(item
      ? {
          name: item.name,
          targetId: item.targetId ?? "",
          inputType: item.inputType,
          command: item.command,
          turns: (item.turns ?? []).join("\n"),
          expected: JSON.stringify(item.expected ?? {}, null, 2),
          checks: JSON.stringify(item.checks ?? [], null, 2),
          priority: item.priority,
        }
      : { ...emptyCase(), targetId: targets[0]?.id ?? "" });
  }, [open, item, targets]);

  const turnList = parseTurns(form.turns);
  const canSave = Boolean(form.name.trim()) && (turnList.length > 0 || Boolean(form.command.trim()));

  const save = async () => {
    if (!form.name.trim() || (turnList.length === 0 && !form.command.trim())) {
      toast("请填写用例名称和至少一轮输入");
      return;
    }
    setSaving(true);
    try {
      const payload: AgentCaseInput = {
        name: form.name.trim(),
        targetId: form.targetId || undefined,
        inputType: form.inputType,
        command: form.command.trim() || turnList[0] || "",
        turns: turnList,
        expected: parseObject(form.expected, "期望"),
        checks: parseChecks(form.checks),
        priority: form.priority,
      };
      if (item) await agentTestApi.updateCase(item.id, payload);
      else await agentTestApi.createCase(payload);
      onSaved();
      toast(item ? "用例已更新" : "用例已创建");
    } catch (error) {
      toast(errorText(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title={item ? "编辑测试用例" : "新建测试用例"}
      width="max-w-2xl"
      onClose={() => { if (!saving) onClose(); }}
      footer={(
        <>
          <Btn v="ghost" disabled={saving} onClick={onClose}>取消</Btn>
          <Btn disabled={saving || !canSave} onClick={() => void save()}>{saving ? "保存中…" : "保存"}</Btn>
        </>
      )}
    >
      <div className="space-y-3">
        <Field label="用例名称">
          <Input className="w-full" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="默认目标">
            <select
              className="h-8 px-2 rounded-md border border-slate-300 text-xs bg-white w-full"
              value={form.targetId}
              onChange={(e) => setForm({ ...form, targetId: e.target.value })}
            >
              <option value="">不指定</option>
              {targets.map((target) => <option key={target.id} value={target.id}>{target.name}</option>)}
            </select>
          </Field>
          <Field label="输入类型">
            <Select className="w-full" opts={INPUT_TYPES} value={form.inputType} onChange={(e) => setForm({ ...form, inputType: e.target.value })} />
          </Field>
          <Field label="优先级">
            <Select className="w-full" opts={PRIORITIES} value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as CasePriority })} />
          </Field>
        </div>
        <Field label="命令 / 消息" hint="单轮输入；多轮场景下可保留第一轮或留空">
          <Textarea className="w-full h-20" value={form.command} onChange={(e) => setForm({ ...form, command: e.target.value })} placeholder="发给 Agent 的输入" />
        </Field>
        <Field label="多轮输入" hint="每行一轮，按顺序发送；留空时使用命令 / 消息作为单轮输入">
          <Textarea
            className="w-full h-24"
            value={form.turns}
            onChange={(e) => setForm({ ...form, turns: e.target.value })}
            placeholder={"第一轮：我想买一部 2000 元左右的手机\n第二轮：有红色的吗\n第三轮：帮我加入购物车"}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="期望 JSON" hint='例如 {"status":"ok","intent":"product_search"}'>
            <Textarea className="w-full h-28 font-mono" spellCheck={false} value={form.expected} onChange={(e) => setForm({ ...form, expected: e.target.value })} />
          </Field>
          <Field label="规则 checks JSON" hint='例如 [{"type":"tool_called","expected":"searchProducts"}]'>
            <Textarea className="w-full h-28 font-mono" spellCheck={false} value={form.checks} onChange={(e) => setForm({ ...form, checks: e.target.value })} />
          </Field>
        </div>
      </div>
    </Modal>
  );
}
