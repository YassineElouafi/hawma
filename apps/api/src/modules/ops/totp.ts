import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const base32 = (buf: Buffer) => { let bits = "", out = ""; for (const b of buf) bits += b.toString(2).padStart(8, "0"); for (let i = 0; i < bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5).padEnd(5, "0"), 2)]; return out; };
export const fromBase32 = (s: string) => { let bits = ""; for (const c of s.replace(/=+$/, "").toUpperCase()) { const v = B32.indexOf(c); if (v < 0) throw new Error("invalid base32"); bits += v.toString(2).padStart(5, "0"); } const out: number[] = []; for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2)); return Buffer.from(out); };

/** RFC 6238 TOTP (HMAC-SHA1, 30 s step, 6 digits) — compatible with Google Authenticator, Authy, 1Password… */
export function totp(secretB32: string, atMs = Date.now(), step = 30, digits = 6): string {
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(Math.floor(atMs / 1000 / step)));
  const h = createHmac("sha1", fromBase32(secretB32)).update(counter).digest(); const o = h[h.length - 1] & 0xf;
  const code = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(code % 10 ** digits).padStart(digits, "0");
}
/** Accepts the current code and ±1 step (clock drift). Constant-time compare. */
export function verifyTotp(secretB32: string, code: string, atMs = Date.now()): boolean {
  if (!/^\d{6}$/.test(code)) return false; let ok = false;
  for (const d of [-1, 0, 1]) { const exp = Buffer.from(totp(secretB32, atMs + d * 30_000)); if (timingSafeEqual(exp, Buffer.from(code))) ok = true; }
  return ok;
}
export const newSecret = () => base32(randomBytes(20));
export const otpauthUrl = (secret: string, account: string, issuer = "Hawma Ops") => `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
export const newRecoveryCodes = (n = 8) => Array.from({ length: n }, () => { const x = randomBytes(5).toString("hex"); return `${x.slice(0, 5)}-${x.slice(5)}`; });
