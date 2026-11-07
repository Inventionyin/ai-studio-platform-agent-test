import { del, get, patch, post, put } from "./http";
import type { Member, Role, RoleName } from "./types";

export const teamApi = {
  members: () => get<Member[]>("/team/members"),
  invite: (input: { email: string; role: RoleName }) =>
    post<{ invite: { id: string; email: string; role: string }; link: string; token: string }>("/team/members", input),
  updateRole: (id: string, role: RoleName) =>
    patch<Member[]>(`/team/members/${encodeURIComponent(id)}`, { role }),
  removeMember: (id: string) => del<Member[]>(`/team/members/${encodeURIComponent(id)}`),
  roles: () => get<Role[]>("/team/roles"),
  savePermissions: (role: RoleName, permissions: string[]) =>
    put<Role[]>(`/team/roles/${encodeURIComponent(role)}`, { permissions }),
};
