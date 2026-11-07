import { useEffect, useState } from "react";
import { tasksApi } from "@/api";
import type { VersionSnapshot } from "@/api/types";
import { useAsync } from "@/hooks/useAsync";
import { useApp } from "@/store/app";
import { downloadText } from "@/lib/download";
import { Btn, Card, Select } from "@/components/ui";
import { MonacoEditor, VersionDiff } from "@/components/business";

const KINDS = ["接口设计", "原型结构", "用例脚本"];

export function VersionCompare() {
  const { data: versions } = useAsync(() => tasksApi.versions(), [], [] as VersionSnapshot[]);
  const [kind, setKind] = useState("接口设计");
  const [view, setView] = useState<"差异" | "原文">("差异");
  const [leftId, setLeftId] = useState("");
  const [rightId, setRightId] = useState("");
  const [compared, setCompared] = useState<{ left: VersionSnapshot; right: VersionSnapshot } | null>(null);
  const { toast } = useApp();

  const list = versions.filter((v) => v.kind === kind);
  const left = list.find((v) => v.id === leftId) ?? list[0];
  const right = list.find((v) => v.id === rightId) ?? list[1] ?? list[0];

  useEffect(() => {
    setLeftId("");
    setRightId("");
  }, [kind]);

  useEffect(() => {
    if (!left || !right) return;
    let alive = true;
    void tasksApi.compare(left.id, right.id).then((res) => { if (alive) setCompared(res); });
    return () => { alive = false; };
  }, [left?.id, right?.id]);

  const exportDiff = () => {
    if (!left || !right) { toast("暂无可对比版本"); return; }
    downloadText(`compare-${left.version}-${right.version}.json`, JSON.stringify(compared ?? { left, right }, null, 2), "application/json");
    toast("对比结果已导出");
  };

  return (
    <div className="space-y-4">
      <Card title="对比设置">
        <div className="flex items-center gap-3 text-xs flex-wrap">
          <span className="text-slate-500">产物类型</span>
          <Select opts={KINDS} value={kind} onChange={(e) => setKind(e.target.value)} />
          <span className="text-slate-500 ml-2">旧版本</span>
          <Select opts={list.map((v) => `${v.version} · ${v.name}`)} value={left ? `${left.version} · ${left.name}` : ""} onChange={(e) => { const v = list.find((x) => `${x.version} · ${x.name}` === e.target.value); if (v) setLeftId(v.id); }} />
          <span className="text-slate-500">新版本</span>
          <Select opts={list.map((v) => `${v.version} · ${v.name}`)} value={right ? `${right.version} · ${right.name}` : ""} onChange={(e) => { const v = list.find((x) => `${x.version} · ${x.name}` === e.target.value); if (v) setRightId(v.id); }} />
          <div className="flex-1" />
          <div className="flex gap-1">
            <Btn v={view === "差异" ? "primary" : "ghost"} onClick={() => setView("差异")}>差异视图</Btn>
            <Btn v={view === "原文" ? "primary" : "ghost"} onClick={() => setView("原文")}>原文对照</Btn>
            <Btn v="ghost" onClick={exportDiff}>导出</Btn>
          </div>
        </div>
      </Card>

      <Card title={left && right ? `${left.name} · ${left.version} → ${right.version}` : "版本对比"} extra={<span className="text-[11px] text-slate-500">共 {list.length} 个版本</span>}>
        {list.length < 2 || !left || !right ? (
          <div className="h-48 grid place-items-center text-xs text-slate-500">该类型暂无可对比的版本</div>
        ) : view === "差异" ? (
          compared ? <VersionDiff left={compared.left.content} right={compared.right.content} leftLabel={compared.left.version} rightLabel={compared.right.version} /> : <div className="h-40 grid place-items-center text-xs text-slate-500">加载差异…</div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-slate-500 mb-2">{left.version} · {left.createdAt}</div>
              <MonacoEditor value={left.content} language={left.kind === "原型结构" ? "json" : left.kind === "接口设计" ? "yaml" : "python"} height={420} readOnly path={`left-${left.id}`} />
            </div>
            <div>
              <div className="text-xs text-slate-500 mb-2">{right.version} · {right.createdAt}</div>
              <MonacoEditor value={right.content} language={right.kind === "原型结构" ? "json" : right.kind === "接口设计" ? "yaml" : "python"} height={420} readOnly path={`right-${right.id}`} />
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
