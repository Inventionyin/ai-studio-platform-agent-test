import { lazy, Suspense } from "react";
import type { MonacoEditorProps } from "./MonacoEditorImpl";

const Impl = lazy(() => import("./MonacoEditorImpl"));

export function MonacoEditor(props: MonacoEditorProps) {
  return (
    <Suspense fallback={<div className="rounded-md border border-slate-800 bg-slate-900 grid place-items-center text-xs text-slate-300" style={{ height: props.height ?? 320 }}>编辑器加载中…</div>}>
      <Impl {...props} />
    </Suspense>
  );
}
