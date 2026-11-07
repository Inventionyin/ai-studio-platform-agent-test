import { useEffect, useState } from "react";
import { agentTestApi, type AgentTargetInput } from "@/api";
import type { AgentTarget, AgentTargetConfig } from "@/api/types";
import { useApp } from "@/store/app";
import { Btn, Field, Input, Modal, Select, Textarea } from "@/components/ui";
import { errorText } from "./agentTestUtils";

const ADAPTER_TYPES = ["mock", "http", "cli", "shangpin"];

const SHANGPIN_PRESET: AgentTargetConfig = {
  baseUrl: "https://shang.bettery.cn",
  adminBaseUrl: "https://admin.bettery.cn",
  customerPhones: ["13900009999", "13900009998"],
  smsCode: "123456",
  clientType: "h5",
  engine: "legacy",
};

interface TargetFormState {
  name: string;
  adapterType: string;
  description: string;
  config: string;
}

const emptyTarget = (): TargetFormState => ({ name: "", adapterType: "http", description: "", config: "{}" });

function parseObject(text: string, label: string): Record<string, unknown> {
  if (!text.trim()) return {};
  const parsed: unknown = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(`${label}必须是 JSON 对象`);
  return parsed as Record<string, unknown>;
}

export function AgentTargetModal({ open, target, onClose, onSaved }: {
  open: boolean;
  target: AgentTarget | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useApp();
  const [form, setForm] = useState<TargetFormState>(emptyTarget);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSaving(false);
    setForm(target
      ? {
          name: target.name,
          adapterType: target.adapterType,
          description: target.description,
          config: JSON.stringify(target.config ?? {}, null, 2),
        }
      : emptyTarget());
  }, [open, target]);

  const applyShangpinPreset = () => {
    setForm((prev) => ({
      ...prev,
      name: prev.name.trim() || "Shang Pivot 智能客服",
      adapterType: "shangpin",
      description: prev.description.trim() || "尚品汇 V3.0 智能客服（legacy SSE）",
      config: JSON.stringify(SHANGPIN_PRESET, null, 2),
    }));
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast("请填写目标名称");
      return;
    }
    setSaving(true);
    try {
      const payload: AgentTargetInput = {
        name: form.name.trim(),
        adapterType: form.adapterType,
        description: form.description.trim(),
        config: parseObject(form.config, "配置") as unknown as AgentTargetConfig,
      };
      if (target) await agentTestApi.updateTarget(target.id, payload);
      else await agentTestApi.createTarget(payload);
      onSaved();
      toast(target ? "目标已更新" : "目标已创建");
    } catch (error) {
      toast(errorText(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title={target ? "编辑 Agent 目标" : "新建 Agent 目标"}
      onClose={() => { if (!saving) onClose(); }}
      footer={(
        <>
          <Btn v="ghost" disabled={saving} onClick={onClose}>取消</Btn>
          <Btn disabled={saving || !form.name.trim()} onClick={() => void save()}>{saving ? "保存中…" : "保存"}</Btn>
        </>
      )}
    >
      <div className="space-y-3">
        <Field label="名称">
          <Input className="w-full" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="例如：商品导购 Agent" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="适配器类型">
            <Select className="w-full" opts={ADAPTER_TYPES} value={form.adapterType} onChange={(e) => setForm({ ...form, adapterType: e.target.value })} />
          </Field>
          <Field label="描述">
            <Input className="w-full" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
        </div>
        <Field label="配置 JSON" as="div" hint="支持 baseUrl / adminBaseUrl / customerPhones / smsCode / clientType / engine 等字段">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Btn v="ghost" type="button" onClick={applyShangpinPreset}>Shang Pivot 智能客服</Btn>
            <span className="text-[11px] text-slate-500">快捷预设：尚品汇 V3.0（legacy SSE）</span>
          </div>
          <Textarea className="w-full h-40 font-mono" spellCheck={false} value={form.config} onChange={(e) => setForm({ ...form, config: e.target.value })} />
        </Field>
      </div>
    </Modal>
  );
}
