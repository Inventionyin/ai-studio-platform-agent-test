import { useState } from "react";
import type { ConversationCard, ConversationTurn } from "@/api/types";
import { Card, Tag } from "@/components/ui";
import { fmtMs } from "./agentTestUtils";

function tokenText(tokens: ConversationTurn["tokens"]) {
  if (!tokens) return "-";
  const prompt = tokens.prompt ?? 0;
  const completion = tokens.completion ?? 0;
  return `${prompt + completion}（输入 ${prompt} / 输出 ${completion}）`;
}

function cardLabel(card: ConversationCard) {
  return card.name || card.spuId || "未命名商品";
}

function cardPrice(card: ConversationCard) {
  if (card.price == null || card.price === "") return "价格未知";
  return typeof card.price === "number" ? `¥${card.price}` : String(card.price);
}

export function AgentConversationCard({ turns }: { turns: ConversationTurn[] }) {
  const [expanded, setExpanded] = useState<number[]>([0]);

  if (turns.length === 0) return null;

  const toggle = (index: number) => {
    setExpanded((list) => (list.includes(index) ? list.filter((item) => item !== index) : [...list, index]));
  };

  return (
    <Card title="对话轮次" extra={<span className="text-[11px] text-slate-500">{turns.length} 轮</span>}>
      <div className="space-y-2">
        {turns.map((turn, index) => {
          const open = expanded.includes(index);
          return (
            <div key={index} className="rounded-md border border-slate-200">
              <button type="button" onClick={() => toggle(index)} className="w-full px-3 py-2 text-left hover:bg-slate-50">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <Tag t={`第 ${index + 1} 轮`} c="gray" />
                    <span className="truncate text-xs text-slate-700" title={turn.input}>{turn.input || "（空输入）"}</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 text-[11px] text-slate-500">
                    {turn.degraded && <Tag t="降级" c="amber" />}
                    <span>{fmtMs(turn.latencyMs)}</span>
                    <span className="text-blue-600">{open ? "收起" : "展开"}</span>
                  </div>
                </div>
              </button>
              {open && (
                <div className="space-y-3 border-t border-slate-100 px-3 py-3">
                  <div>
                    <div className="mb-1 text-[11px] text-slate-500">输入</div>
                    <div className="whitespace-pre-wrap rounded-md bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-700">{turn.input || "-"}</div>
                  </div>
                  <div>
                    <div className="mb-1 text-[11px] text-slate-500">最终回答</div>
                    <div className="max-h-60 overflow-auto whitespace-pre-wrap rounded-md bg-slate-900 px-3 py-2 text-xs leading-5 text-slate-100">{turn.answer || "（无回答）"}</div>
                  </div>
                  <div>
                    <div className="mb-1 text-[11px] text-slate-500">商品卡片</div>
                    {(turn.cards?.length ?? 0) === 0 ? (
                      <span className="text-xs text-slate-400">-</span>
                    ) : (
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {turn.cards?.map((card, cardIndex) => (
                          <div key={cardIndex} className="flex items-center justify-between gap-2 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2">
                            <span className="truncate text-xs text-slate-700" title={cardLabel(card)}>{cardLabel(card)}</span>
                            <span className="shrink-0 text-xs font-medium text-rose-600">{cardPrice(card)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div>
                      <div className="mb-1 text-[11px] text-slate-500">来源 sources</div>
                      {(turn.sources?.length ?? 0) === 0 ? (
                        <span className="text-xs text-slate-400">-</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {turn.sources?.map((source) => <Tag key={source} t={source} c="gray" />)}
                        </div>
                      )}
                    </div>
                    <div>
                      <div className="mb-1 text-[11px] text-slate-500">Token</div>
                      <span className="text-xs text-slate-700">{tokenText(turn.tokens)}</span>
                    </div>
                    <div>
                      <div className="mb-1 text-[11px] text-slate-500">降级状态</div>
                      <Tag t={turn.degraded ? "已降级" : "正常"} c={turn.degraded ? "amber" : "green"} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
