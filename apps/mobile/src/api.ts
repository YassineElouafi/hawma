import * as SecureStore from "expo-secure-store";
import { API_URL } from "./config";

export interface Tokens { accessToken: string; refreshToken: string; userId: string }
export class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }

let tokens: Tokens | null = null;
let onLogout: () => void = () => {};
export const setOnLogout = (f: () => void) => { onLogout = f; };

export async function loadTokens() { const raw = await SecureStore.getItemAsync("tokens"); tokens = raw ? JSON.parse(raw) : null; return tokens; }
export async function saveTokens(t: Tokens | null) { tokens = t; if (t) await SecureStore.setItemAsync("tokens", JSON.stringify(t)); else await SecureStore.deleteItemAsync("tokens"); }
export const currentUserId = () => tokens?.userId;
export const accessToken = () => tokens?.accessToken;

async function raw(path: string, init: RequestInit & { auth?: boolean } = {}) {
  const headers: Record<string, string> = { ...(init.body ? { "content-type": "application/json" } : {}), ...(init.headers as Record<string, string>) };
  if (init.auth && tokens) headers.authorization = `Bearer ${tokens.accessToken}`;
  const res = await fetch(API_URL + path, { ...init, headers });
  const text = await res.text();
  const body = text ? JSON.parse(text) : undefined;
  if (!res.ok) throw new ApiError(res.status, body?.title ?? res.statusText);
  return body;
}

/** Authenticated call with one transparent refresh on 401 (refresh tokens rotate, so concurrent refreshes are serialised). */
let refreshing: Promise<void> | null = null;
export async function api<T = any>(path: string, init: RequestInit & { auth?: boolean } = { auth: true }): Promise<T> {
  try { return await raw(path, { auth: true, ...init }); }
  catch (e) {
    if (!(e instanceof ApiError) || e.status !== 401 || !tokens) throw e;
    refreshing ??= (async () => {
      try { const t = await raw("/v1/auth/refresh", { method: "POST", body: JSON.stringify({ refreshToken: tokens!.refreshToken }) }); await saveTokens(t); }
      catch { await saveTokens(null); onLogout(); throw e; }
      finally { refreshing = null; }
    })();
    await refreshing;
    return raw(path, { auth: true, ...init });
  }
}
export const post = <T = any>(path: string, body?: unknown, auth = true) => api<T>(path, { method: "POST", auth, body: body === undefined ? undefined : JSON.stringify(body) });
