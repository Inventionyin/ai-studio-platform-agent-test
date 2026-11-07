import { useEffect, useRef, useState } from "react";
import { aiApi, knowledgeApi } from "@/api";
import type { ChatConfig, ChatMessage, Conversation, KnowledgeBase } from "@/api/types";
import { useAsync } from "@/hooks/useAsync";
import { useApp } from "@/store/app";
import { MODELS } from "@/config/constants";
import { Btn, Drawer, Empty, Field, Input, Select, Tag, Textarea } from "@/components/ui";
import { cx } from "@/lib/cx";

const QUICK = ["生成用例", "生成脚本", "分析报错"];

export function Chat() {
  const { data: conversations, setData: setConversations } = useAsync(() => aiApi.conversations(), [], [] as Conversation[]);
  const { data: config, setData: setConfig } = useAsync(() => aiApi.config(), [], { model: "GPT-4o", kbIds: [], systemPrompt: "" } as ChatConfig);
  const { data: kbs } = useAsync(() => knowledgeApi.list(), [], [] as KnowledgeBase[]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [draftConfig, setDraftConfig] = useState<ChatConfig | null>(null);
  const timer = useRef<number | null>(null);
  const { toast } = useApp();

  const selected = conversations.find((c) => c.id === selectedId) ?? conversations[0];

  useEffect(() => {
    if (!selectedId && conversations[0]) setSelectedId(conversations[0].id);
  }, [conversations, selectedId]);

  useEffect(() => {
    setMessages(selected?.messages ?? []);
  }, [selected?.id]);

  useEffect(() => () => { if (timer.current) window.clearInterval(timer.current); }, []);

  const send = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || streaming) return;
    setInput("");
    setStreaming(true);
    const userMessage: ChatMessage = { id: `local-${Date.now()}`, role: "user", content };
    setMessages((list) => [...list, userMessage]);
    try {
      const res = await aiApi.send(selected?.id ?? "", content);
      if (!selectedId) setSelectedId(res.conversationId);
      const placeholder: ChatMessage = { ...res.message, content: "" };
      setMessages((list) => [...list, placeholder]);
      let i = 0;
      timer.current = window.setInterval(() => {
        i += 3;
        setMessages((list) => list.map((m) => m.id === placeholder.id ? { ...m, content: res.message.content.slice(0, i), citations: i >= res.message.content.length ? res.message.citations : [], toolCalls: i >= res.message.content.length ? res.message.toolCalls : [], usage: i >= res.message.content.length ? res.message.usage : undefined } : m));
        if (i >= res.message.content.length) {
          if (timer.current) window.clearInterval(timer.current);
          timer.current = null;
          setStreaming(false);
          void aiApi.conversations().then(setConversations);
        }
      }, 18);
    } catch (e) {
      setStreaming(false);
      toast(e instanceof Error ? e.message : "发送失败");
    }
  };

  const newConversation = async () => {
    if (streaming) return;
    const conv = await aiApi.createConversation();
    setConversations([conv, ...conversations]);
    setSelectedId(conv.id);
    setMessages([]);
  };

  const removeConversation = async (id: string) => {
    const next = await aiApi.removeConversation(id);
    setConversations(next);
    if (selectedId === id) setSelectedId(next[0]?.id ?? "");
  };

  const openContext = () => {
    setDraftConfig(config);
    setContextOpen(true);
  };

  const saveContext = async () => {
    if (!draftConfig) return;
    setConfig(await aiApi.saveConfig(draftConfig));
    setContextOpen(false);
    toast("上下文配置已保存");
  };

  return (
    <div className="grid grid-cols-4 gap-4 h-[calc(100vh-200px)]">
      <div className="bg-white rounded-lg border border-slate-200 shadow-sm flex flex-col">
        <div className="flex items-center justify-between px-4 h-11 border-b border-slate-100">
          <h3 className="text-sm font-semibold">会话</h3>
          <Btn v="ghost" onClick={newConversation}>+ 新建</Btn>
        </div>
        <div className="p-2 overflow-y-auto flex-1">
          {conversations.map((c) => (
            <div key={c.id} className={cx("group flex items-center justify-between px-2 py-2 rounded text-xs cursor-pointer", selected?.id === c.id ? "bg-blue-50 text-blue-700" : "hover:bg-slate-50")} onClick={() => !streaming && setSelectedId(c.id)}>
              <div className="min-w-0">
                <div className="truncate">{c.title}</div>
                <div className="text-[11px] text-slate-500">{c.updatedAt}</div>
              </div>
              <button onClick={(e) => { e.stopPropagation(); void removeConversation(c.id); }} className="text-slate-300 hover:text-rose-500 px-1" aria-label="删除会话">×</button>
            </div>
          ))}
          {conversations.length === 0 && <Empty text="暂无会话" className="h-32" />}
        </div>
      </div>

      <section className="col-span-3 bg-white rounded-lg border border-slate-200 shadow-sm flex flex-col">
        <div className="flex items-center gap-2 px-4 h-11 border-b border-slate-100 text-xs">
          <span className="font-medium">{selected?.title ?? "新会话"}</span>
          <Tag t={config.model} c="blue" />
          <div className="flex-1" />
          <span className="text-slate-500">知识库：{kbs.filter((k) => config.kbIds.includes(k.id)).map((k) => k.name).join("、") || "未绑定"}</span>
          <Btn v="ghost" onClick={openContext}>上下文配置</Btn>
        </div>

        <div className="flex-1 overflow-auto p-4 space-y-4">
          {messages.length === 0 && <Empty text="开始提问，或使用下方快捷指令" />}
          {messages.map((m) => (
            <div key={m.id} className={cx("max-w-[75%] px-3 py-2 rounded-lg text-xs leading-relaxed whitespace-pre-wrap", m.role === "user" ? "ml-auto bg-blue-600 text-white" : "bg-slate-100 text-slate-800")}>
              {m.content || "…"}
              {m.role === "assistant" && m.citations && m.citations.length > 0 && (
                <div className="mt-2 pt-2 border-t border-slate-200/70 space-y-1">
                  <div className="text-[10px] text-slate-500">引用来源</div>
                  {m.citations.map((c) => (
                    <div key={`${c.doc}-${c.chunk}`} className="flex justify-between gap-2 text-[11px] text-slate-500">
                      <span className="truncate">{c.doc} · {c.chunk}</span>
                      <span className="text-blue-600 shrink-0">{c.score.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}
              {m.role === "assistant" && m.toolCalls && m.toolCalls.length > 0 && (
                <div className="mt-2 pt-2 border-t border-slate-200/70 text-[11px] text-slate-500">
                  <div className="text-[10px] text-slate-500">工具调用</div>
                  {m.toolCalls.map((t) => <div key={t.name} className="font-mono">{t.name}({t.args}) → {t.result}</div>)}
                </div>
              )}
              {m.role === "assistant" && m.usage && (
                <div className="mt-1 text-[10px] text-slate-500">Token：{m.usage.prompt} 输入 / {m.usage.completion} 输出</div>
              )}
            </div>
          ))}
        </div>

        <div className="px-4 py-2 border-t border-slate-100 flex gap-2">
          {QUICK.map((q) => <button key={q} onClick={() => { setInput(`请帮我${q}：`); }} className="px-2 py-1 rounded-full border border-slate-300 text-[11px] text-slate-600 hover:border-blue-500">{q}</button>)}
        </div>

        <div className="flex gap-2 p-3 border-t border-slate-100">
          <Select opts={MODELS} value={config.model} onChange={(e) => setConfig({ ...config, model: e.target.value })} />
          <Input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void send(); }} placeholder="输入问题，Enter 发送" className="flex-1" />
          <Btn onClick={() => send()} disabled={streaming}>{streaming ? "生成中…" : "发送"}</Btn>
        </div>
      </section>

      <Drawer open={contextOpen} title="上下文配置" onClose={() => setContextOpen(false)} footer={<><Btn v="ghost" onClick={() => setContextOpen(false)}>取消</Btn><Btn onClick={saveContext}>保存</Btn></>}>
        {draftConfig && (
          <div className="space-y-4">
            <Field label="模型"><Select opts={MODELS} className="w-full" value={draftConfig.model} onChange={(e) => setDraftConfig({ ...draftConfig, model: e.target.value })} /></Field>
            <Field label="绑定知识库" as="div">
              <div className="space-y-2 mt-1">
                {kbs.map((k) => (
                  <label key={k.id} className="flex items-center gap-2 text-xs">
                    <input type="checkbox" checked={draftConfig.kbIds.includes(k.id)} onChange={() => setDraftConfig({ ...draftConfig, kbIds: draftConfig.kbIds.includes(k.id) ? draftConfig.kbIds.filter((id) => id !== k.id) : [...draftConfig.kbIds, k.id] })} />
                    {k.name} <span className="text-[11px] text-slate-500">{k.docs} 文档</span>
                  </label>
                ))}
              </div>
            </Field>
            <Field label="系统提示词"><Textarea className="w-full h-40" value={draftConfig.systemPrompt} onChange={(e) => setDraftConfig({ ...draftConfig, systemPrompt: e.target.value })} /></Field>
          </div>
        )}
      </Drawer>
    </div>
  );
}
