import { useState } from "react";
import { profileApi } from "@/api";
import type { ApiKey } from "@/api/types";
import { useAsync } from "@/hooks/useAsync";
import { useApp } from "@/store/app";
import { Btn, Card, Field, Input, Modal, Table } from "@/components/ui";

export function ProfileKeys() {
  const { data, setData } = useAsync(() => profileApi.apiKeys(), [], [] as ApiKey[]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [secret, setSecret] = useState<string | null>(null);
  const { toast } = useApp();

  const create = async () => {
    if (!name.trim()) { toast("请输入 Key 名称"); return; }
    const res = await profileApi.createKey(name.trim());
    setData([res.record, ...data]);
    setSecret(res.secret);
    setOpen(false);
    setName("");
  };

  const revoke = async (id: string) => {
    if (!window.confirm("确定停用该 API Key？停用后无法恢复。")) return;
    setData(await profileApi.revokeKey(id));
    toast("API Key 已停用");
  };

  const rotate = async (key: ApiKey) => {
    if (!window.confirm(`确定轮换「${key.name}」？旧 Key 会立即停用。`)) return;
    const res = await profileApi.createKey(`${key.name} · 轮换`);
    setData(await profileApi.revokeKey(key.id));
    setSecret(res.secret);
    toast("已生成新 Key，旧 Key 已停用");
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast("已复制到剪贴板");
    } catch {
      toast("复制失败，请手动选择");
    }
  };

  return (
    <>
      <Card extra={<Btn onClick={() => setOpen(true)}>+ 新建 API Key</Btn>} title="API Key 管理">
        <div className="text-[11px] text-slate-500 mb-3">API Key 用于 CI 流水线与外部系统调用，密钥仅在创建时展示一次。</div>
        <Table
          cols={["名称", "Key 前缀", "创建时间", "最近使用", "状态"]}
          rows={data.map((k) => [k.name, <code key="p" className="text-[11px]">{k.prefix}••••••••</code>, k.createdAt, k.lastUsed, k.status])}
          actions={(i) => (
            <>
              <Btn v="ghost" onClick={() => rotate(data[i])}>轮换</Btn>
              <Btn v="danger" disabled={data[i].status === "停用"} onClick={() => revoke(data[i].id)}>停用</Btn>
            </>
          )}
        />
      </Card>

      <Modal open={open} title="新建 API Key" onClose={() => setOpen(false)} footer={<><Btn v="ghost" onClick={() => setOpen(false)}>取消</Btn><Btn onClick={create}>创建</Btn></>}>
        <Field label="名称" hint="例如：CI 流水线、数据同步"><Input className="w-full" value={name} onChange={(e) => setName(e.target.value)} placeholder="Key 用途" autoFocus /></Field>
      </Modal>

      <Modal open={!!secret} title="API Key 已创建" onClose={() => setSecret(null)} footer={<Btn onClick={() => setSecret(null)}>我已保存</Btn>}>
        <div className="text-xs text-slate-600 mb-2">请立即复制并妥善保管，关闭后将无法再次查看完整密钥。</div>
        <div className="flex gap-2">
          <Input readOnly value={secret ?? ""} className="flex-1 font-mono" />
          <Btn v="ghost" onClick={() => secret && copy(secret)}>复制</Btn>
        </div>
      </Modal>
    </>
  );
}
