import { adminApi } from "@/api";
import type { RoutingRule } from "@/api/types";
import { MODELS } from "@/config/constants";
import { useAsync } from "@/hooks/useAsync";
import { useApp } from "@/store/app";
import { Btn, Card, Switch, Table } from "@/components/ui";

export function ModelRouting() {
  const { data, setData } = useAsync(() => adminApi.routing(), [], [] as RoutingRule[]);
  const { toast } = useApp();

  const patch = (id: string, next: Partial<RoutingRule>) => setData(data.map((r) => (r.id === id ? { ...r, ...next } : r)));

  const save = async () => {
    setData(await adminApi.saveRouting(data));
    toast("模型路由规则已保存");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-xs text-slate-500">按任务类型分配主模型与备用模型，主模型失败时自动切换。</div>
        <Btn onClick={save}>保存规则</Btn>
      </div>

      <Card title="路由规则">
        <Table
          cols={["任务类型", "主模型", "备用模型", "启用"]}
          rows={data.map((r) => [
            r.taskType,
            <select key="p" value={r.primary} onChange={(e) => patch(r.id, { primary: e.target.value })} className="h-7 px-1.5 rounded border border-slate-300 text-xs bg-white">
              {MODELS.map((m) => <option key={m}>{m}</option>)}
            </select>,
            <select key="f" value={r.fallback} onChange={(e) => patch(r.id, { fallback: e.target.value })} className="h-7 px-1.5 rounded border border-slate-300 text-xs bg-white">
              {MODELS.map((m) => <option key={m}>{m}</option>)}
            </select>,
            <Switch key="s" checked={r.enabled} onChange={(v) => patch(r.id, { enabled: v })} label={`${r.taskType}启用`} />,
          ])}
        />
      </Card>

      <Card title="路由策略说明">
        <div className="text-xs text-slate-600 space-y-2 leading-relaxed">
          <div>1. 任务发起时按任务类型查询启用中的规则，优先调用主模型。</div>
          <div>2. 主模型超时（120s）或返回 5xx 时自动切换备用模型，并记录一次降级事件。</div>
          <div>3. 未配置规则的任务类型使用平台默认模型，可在「模型供应商」中设置。</div>
          <div>4. 规则修改即时生效，不影响正在执行的任务。</div>
        </div>
      </Card>
    </div>
  );
}
