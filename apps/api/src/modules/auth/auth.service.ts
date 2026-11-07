import { Injectable, UnauthorizedException, HttpException, HttpStatus } from "@nestjs/common";
import { SignJWT, jwtVerify } from "jose";
import { createHash, randomInt, randomUUID } from "node:crypto";

export interface OtpStore { set(phone: string, hash: string, ttlS: number): Promise<void>; get(phone: string): Promise<{ hash: string; attempts: number } | null>; bump(phone: string): Promise<number>; del(phone: string): Promise<void>; hit(key: string, limit: number, windowS: number): Promise<boolean> }
export interface OtpSender { send(phone: string, code: string): Promise<void> }

/** Dev/test implementations. Production wires Redis + WhatsApp/SMS (docs §F1). */
export class MemoryOtpStore implements OtpStore {
  private m = new Map<string, { hash: string; attempts: number; exp: number }>();
  private hits = new Map<string, number[]>();
  async set(phone: string, hash: string, ttlS: number) { this.m.set(phone, { hash, attempts: 0, exp: Date.now() + ttlS * 1000 }); }
  async get(phone: string) { const v = this.m.get(phone); if (!v || v.exp < Date.now()) return null; return { hash: v.hash, attempts: v.attempts }; }
  async bump(phone: string) { const v = this.m.get(phone); if (!v) return 0; return ++v.attempts; }
  async del(phone: string) { this.m.delete(phone); }
  async hit(key: string, limit: number, windowS: number) {
    const now = Date.now(); const arr = (this.hits.get(key) ?? []).filter((t) => now - t < windowS * 1000);
    if (arr.length >= limit) return false; arr.push(now); this.hits.set(key, arr); return true;
  }
}
export class ConsoleOtpSender implements OtpSender { last = new Map<string, string>(); async send(phone: string, code: string) { this.last.set(phone, code); } }

const E164_MA = /^\+212[5-7]\d{8}$/;
const hash = (phone: string, code: string) => createHash("sha256").update(`${phone}:${code}`).digest("hex");

@Injectable()
export class AuthService {
  private key = new TextEncoder().encode(process.env.JWT_SECRET ?? "dev-only-secret-change-me-32-bytes-min!!");
  constructor(readonly store: OtpStore, readonly sender: OtpSender, private users = new Map<string, string>()) {}

  normalise(phone: string): string {
    const p = phone.replace(/[\s.-]/g, "").replace(/^00/, "+").replace(/^0([5-7])/, "+212$1");
    if (!E164_MA.test(p)) throw new HttpException("invalid Moroccan phone number", HttpStatus.BAD_REQUEST);
    return p;
  }

  async requestOtp(rawPhone: string, ip = "unknown") {
    const phone = this.normalise(rawPhone);
    if (!(await this.store.hit(`otp:phone:${phone}`, 3, 600)) || !(await this.store.hit(`otp:ip:${ip}`, 20, 600)))
      throw new HttpException("too many requests", HttpStatus.TOO_MANY_REQUESTS);
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    await this.store.set(phone, hash(phone, code), 300);
    await this.sender.send(phone, code);
    return { sent: true, expiresInS: 300 };
  }

  async verifyOtp(rawPhone: string, code: string) {
    const phone = this.normalise(rawPhone);
    const rec = await this.store.get(phone);
    if (!rec) throw new UnauthorizedException("code expired or not requested");
    if ((await this.store.bump(phone)) > 5) { await this.store.del(phone); throw new UnauthorizedException("too many attempts"); }
    if (rec.hash !== hash(phone, code)) throw new UnauthorizedException("wrong code");
    await this.store.del(phone);
    let userId = this.users.get(phone);
    if (!userId) { userId = randomUUID(); this.users.set(phone, userId); }
    return { userId, accessToken: await this.sign(userId), expiresInS: 900 };
  }

  sign(sub: string) { return new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setSubject(sub).setIssuedAt().setExpirationTime("15m").setIssuer("hawma").sign(this.key); }
  async verify(token: string): Promise<string> {
    try { const { payload } = await jwtVerify(token, this.key, { issuer: "hawma" }); return payload.sub!; }
    catch { throw new UnauthorizedException("invalid token"); }
  }
}
