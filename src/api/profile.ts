import { get, post, put } from "./http";
import type { ApiKey, Asset, UserProfile } from "./types";

export const profileApi = {
  get: () => get<UserProfile>("/profile"),
  update: (patch: Partial<UserProfile>) => put<UserProfile>("/profile", patch),
  changePassword: (oldPassword: string, newPassword: string) =>
    post<null>("/profile/password", { oldPassword, newPassword }),
  assets: () => get<Asset[]>("/profile/assets"),
  apiKeys: () => get<ApiKey[]>("/profile/keys"),
  createKey: (name: string) => post<{ record: ApiKey; secret: string }>("/profile/keys", { name }),
  revokeKey: (id: string) => post<ApiKey[]>(`/profile/keys/${encodeURIComponent(id)}/revoke`),
};
