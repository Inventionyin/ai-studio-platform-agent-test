import Editor, { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor/editor/editor.api";
import "monaco-editor/languages/definitions/yaml/register";
import "monaco-editor/languages/definitions/python/register";
import "monaco-editor/language/json/monaco.contribution";
import EditorWorker from "monaco-editor/editor/editor.worker?worker";
import JsonWorker from "monaco-editor/language/json/json.worker?worker";

interface MonacoGlobal {
  MonacoEnvironment?: { getWorker: (moduleId: string, label: string) => Worker };
}

const globalScope = self as unknown as MonacoGlobal;
if (!globalScope.MonacoEnvironment) {
  globalScope.MonacoEnvironment = {
    getWorker(_moduleId: string, label: string) {
      if (label === "json") return new JsonWorker();
      return new EditorWorker();
    },
  };
}

loader.config({ monaco });

const DARK_THEME = {
  base: "vs-dark" as const,
  inherit: true,
  rules: [],
  colors: {
    "editor.background": "#0f172a",
    "editor.lineHighlightBackground": "#1e293b",
    "editorLineNumber.foreground": "#475569",
    "editorIndentGuide.background1": "#1e293b",
  },
};

export interface MonacoEditorProps {
  value: string;
  onChange?: (value: string) => void;
  language?: string;
  height?: number;
  readOnly?: boolean;
  path?: string;
}

export default function MonacoEditorImpl({ value, onChange, language = "yaml", height = 320, readOnly = false, path }: MonacoEditorProps) {
  return (
    <div className="rounded-md overflow-hidden border border-slate-800 bg-slate-900">
      <Editor
        path={path}
        height={height}
        language={language}
        value={value}
        onChange={(v) => onChange?.(v ?? "")}
        theme="ast-dark"
        beforeMount={(m) => m.editor.defineTheme("ast-dark", DARK_THEME)}
        loading={<div className="h-full grid place-items-center text-xs text-slate-300">编辑器加载中…</div>}
        options={{
          minimap: { enabled: false },
          fontSize: 12,
          scrollBeyondLastLine: false,
          wordWrap: "on",
          automaticLayout: true,
          readOnly,
          tabSize: 2,
          padding: { top: 8, bottom: 8 },
          scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
        }}
      />
    </div>
  );
}
