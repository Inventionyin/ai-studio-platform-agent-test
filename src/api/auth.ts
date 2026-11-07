import { get, post, setAccessToken } from "./http";
import type { RoleName } from "./types";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: RoleName;
  status: string;
  dept: string;
  avatar: string;
}

export interface AuthSession {
  accessToken: string;
  user: AuthUser;
}

export interface OAuthProvider {
  id: string;
  name: string;
}

export const authApi = {
  async login(email: string, password: string): Promise<AuthSession> {
    const session = await post<AuthSession>("/auth/login", { email, password });
    setAccessToken(session.accessToken);
    return session;
  },
  async refresh(): Promise<AuthSession | null> {
    try {
      const session = await post<AuthSession>("/auth/refresh");
      setAccessToken(session.accessToken);
      return session;
    } catch {
      return null;
    }
  },
  async me(): Promise<AuthUser> {
    return get<AuthUser>("/auth/me");
  },
  async logout(): Promise<void> {
    try {
      await post<null>("/auth/logout");
    } finally {
      setAccessToken(null);
    }
  },
  async acceptInvite(token: string, name: string, password: string): Promise<AuthSession> {
    const session = await post<AuthSession>("/auth/invites/accept", { token, name, password });
    setAccessToken(session.accessToken);
    return session;
  },
  async invites(): Promise<{ id: string; email: string; role: string; status: string; expiresAt: string }[]> {
    return get("/auth/invites");
  },
  async createInvite(email: string, role: RoleName): Promise<{ invite: { id: string; email: string; role: string }; link: string; token: string }> {
    return post("/auth/invites", { email, role });
  },
  async oauthProviders(): Promise<OAuthProvider[]> {
    return get<OAuthProvider[]>("/auth/oauth/providers");
  },
  oauthUrl(provider: string): string {
    return `${(import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "/api/v1"}/auth/oauth/${provider}/authorize`;
  },
};
