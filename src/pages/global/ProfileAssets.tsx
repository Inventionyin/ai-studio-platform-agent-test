import { useState } from "react";
import { profileApi } from "@/api";
import type { Asset } from "@/api/types";
import { useAsync } from "@/hooks/useAsync";
import { useApp } from "@/store/app";
import { downloadText } from "@/lib/download";
import { Btn, Card, Select, Table, Toolbar, Tag } from "@/components/ui";

const TYPES = ["全部类型", "原型", "接口设计", "测试报告"];

export function ProfileAssets() {
  const { data } = useAsync(() => profileApi.assets(), [], [] as Asset[]);
  const [type, setType] = useState("全部类型");
  const [query, setQuery] = useState("");
  const { toast } = useApp();

  const list = data.filter((a) => (type === "全部类型" || a.type === type) && (!query || a.name.includes(query)));

  const download = (asset: Asset) => {
    downloadText(asset.name.endsWith(".json") || asset.name.endsWith(".yaml") ? asset.name : `${asset.name}.txt`, `产物：${asset.name}\n类型：${asset.type}\n项目：${asset.project}`);
    toast(`已导出 ${asset.name}`);
  };

  const exportList = () => {
    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const rows = list.map((a) => [a.name, a.type, a.project, a.size, a.createdAt].map(escape).join(","));
    downloadText("assets.csv", "\uFEFF" + ["名称,类型,项目,大小,创建时间", ...rows].join("\n"), "text/csv;charset=utf-8");
    toast("已导出产物清单");
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-4">
        {[["产物总数", "3"], ["原型 JSON", "1"], ["接口设计", "1"], ["测试报告", "1"]].map(([l, v]) => (
          <Card key={l}><div className="text-xs text-slate-500">{l}</div><div className="text-2xl font-semibold mt-1">{v}</div></Card>
        ))}
      </div>
      <Card>
        <Toolbar placeholder="搜索产物名称" onSearch={setQuery} filters={<Select opts={TYPES} onChange={(e) => setType(e.target.value)} />}>
          <Btn v="ghost" onClick={exportList}>导出清单</Btn>
        </Toolbar>
        <Table
          cols={["产物名称", "类型", "所属项目", "大小", "创建时间"]}
          rows={list.map((a) => [a.name, <Tag key="t" t={a.type} c="blue" />, a.project, a.size, a.createdAt])}
          actions={(i) => <><Btn v="ghost" onClick={() => download(list[i])}>下载</Btn></>}
        />
      </Card>
    </div>
  );
}
