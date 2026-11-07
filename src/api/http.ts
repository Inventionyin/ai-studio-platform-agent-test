const BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "/api/v1";

interface Envelope<T> {
  code: number;
  message: string;
  data: T;
}

let accessToken: string | null = null;
let activeProjectId: string | null = null;
let refreshPromise: Promise<string | null> | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

export function setActiveProjectId(projectId: string | null) {
  activeProjectId = projectId;
}

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (activeProjectId) headers["X-Project-Id"] = activeProjectId;
  return headers;
}

async function parse<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as Envelope<T> | { detail?: unknown } | null;
  const envelope = payload as Envelope<T> | null;
  if (!response.ok || !envelope || envelope.code !== 0) {
    const detail = (payload as { detail?: unknown } | null)?.detail;
    const message = envelope?.message ?? detail ?? `HTTP ${response.status}`;
    throw new Error(typeof message === "string" ? message : JSON.stringify(message));
  }
  return envelope.data;
}

async function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const response = await fetch(`${BASE}/auth/refresh`, {
          method: "POST",
          credentials: "include",
        });
        if (!response.ok) return null;
        const payload = (await response.json()) as Envelope<{ accessToken: string }>;
        if (payload.code !== 0) return null;
        accessToken = payload.data.accessToken;
        return accessToken;
      } catch {
        return null;
      } finally {
        refreshPromise = null;
      }
    })();
  }
  return refreshPromise;
}

async function request<T>(method: string, path: string, body?: unknown, retry = true): Promise<T> {
  let response: Response;
  try {
    response = await fetch(BASE + path, {
      method,
      credentials: "include",
      headers: {
        ...authHeaders(),
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error("无法连接后端，请确认后端已启动");
  }
  if (response.status === 401 && retry && !path.startsWith("/auth/")) {
    const token = await refreshAccessToken();
    if (token) return request<T>(method, path, body, false);
    window.dispatchEvent(new Event("auth:expired"));
  }
  return parse<T>(response);
}

export const get = <T>(path: string) => request<T>("GET", path);
export const post = <T>(path: string, body: unknown = {}) => request<T>("POST", path, body);
export const put = <T>(path: string, body: unknown = {}) => request<T>("PUT", path, body);
export const patch = <T>(path: string, body: unknown = {}) => request<T>("PATCH", path, body);
export const del = <T>(path: string) => request<T>("DELETE", path);

export async function upload<T>(path: string, form: FormData): Promise<T> {
  let response: Response;
  try {
    response = await fetch(BASE + path, { method: "POST", credentials: "include", headers: authHeaders(), body: form });
  } catch {
    throw new Error("无法连接后端，请确认后端已启动");
  }
  if (response.status === 401) {
    const token = await refreshAccessToken();
    if (token) {
      response = await fetch(BASE + path, { method: "POST", credentials: "include", headers: authHeaders(), body: form });
    }
  }
  return parse<T>(response);
}

export async function download(path: string): Promise<Blob> {
  let response = await fetch(BASE + path, { credentials: "include", headers: authHeaders() });
  if (response.status === 401) {
    const token = await refreshAccessToken();
    if (token) response = await fetch(BASE + path, { credentials: "include", headers: authHeaders() });
  }
  if (!response.ok) throw new Error(`下载失败：HTTP ${response.status}`);
  return response.blob();
}

export { BASE as API_BASE };
