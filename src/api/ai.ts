import { del, get, patch, post, put } from "./http";
import type { ChatConfig, ChatMessage, Conversation } from "./types";

export const aiApi = {
  conversations: () => get<Conversation[]>("/ai/conversations"),
  config: () => get<ChatConfig>("/ai/config"),
  saveConfig: (config: ChatConfig) => put<ChatConfig>("/ai/config", config),
  createConversation: (title = "新会话") => post<Conversation>("/ai/conversations", { title }),
  renameConversation: (id: string, title: string) => patch<Conversation[]>(`/ai/conversations/${encodeURIComponent(id)}`, { title }),
  removeConversation: (id: string) => del<Conversation[]>(`/ai/conversations/${encodeURIComponent(id)}`),
  async send(conversationId: string, text: string) {
    const id = conversationId || (await post<Conversation>("/ai/conversations", { title: text.slice(0, 16) })).id;
    return post<{ conversationId: string; userMessage: ChatMessage; message: ChatMessage }>(
      `/ai/conversations/${encodeURIComponent(id)}/messages`,
      { text },
    );
  },
};
