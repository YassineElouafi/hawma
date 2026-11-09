const API = "/api";
export class ApiError extends Error { constructor(public status: number, m: string) { super(m); } }
type Tokens = { accessToken: string; refreshToken: string; userId: string };
let tokens: Tokens | null = (() => { try { return JSON.parse(localStorage.getItem("hawma.web.tokens") || "null"); } catch { return null; } })();
const listeners = new Set<() => void>();
export const onAuthChange = (f: () => void) => { listeners.add(f); return () => listeners.delete(f); };
export const save = (t: Tokens | null) => { tokens = t; if (t) localStorage.setItem("hawma.web.tokens", JSON.stringify(t)); else localStorage.removeItem("hawma.web.tokens"); listeners.forEach((f) => f()); };
export const isAuthed = () => !!tokens;
export const accessToken = () => tokens?.accessToken;

async function raw(path: string, init: RequestInit & { auth?: boolean } = {}) {
  const headers: Record<string, string> = { ...(init.body ? { "content-type": "application/json" } : {}) };
  if (init.auth !== false && tokens) headers.authorization = `Bearer ${tokens.accessToken}`;
  const r = await fetch(API + path, { ...init, headers });
  const t = await r.text(); const b = t ? JSON.parse(t) : undefined;
  if (!r.ok) throw new ApiError(r.status, b?.title ?? r.statusText);
  return b;
}
let refreshing: Promise<void> | null = null;
export async function api<T = any>(path: string, init: RequestInit & { auth?: boolean } = {}): Promise<T> {
  try { return await raw(path, init); }
  catch (e) {
    if (!(e instanceof ApiError) || e.status !== 401 || !tokens || init.auth === false) throw e;
    refreshing ??= (async () => { try { save(await raw("/v1/auth/refresh", { method: "POST", auth: false, body: JSON.stringify({ refreshToken: tokens!.refreshToken }) })); } catch { save(null); throw e; } finally { refreshing = null; } })();
    await refreshing; return raw(path, init);
  }
}
export const post = <T = any>(path: string, body?: unknown, auth = true) => api<T>(path, { method: "POST", auth, body: body === undefined ? undefined : JSON.stringify(body) });
