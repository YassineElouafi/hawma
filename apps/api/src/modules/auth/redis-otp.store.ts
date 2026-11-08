import type { Redis } from "ioredis";
import type { OtpStore } from "./auth.service";

/** Redis-backed OTP store: hashed code with TTL, attempt counter, sliding-window-ish rate limit via INCR+EXPIRE. */
export class RedisOtpStore implements OtpStore {
  constructor(private r: Redis, private prefix = "hawma:") {}
  private k = (s: string) => this.prefix + s;

  async set(phone: string, hash: string, ttlS: number) {
    await this.r.multi().hset(this.k(`otp:${phone}`), { hash, attempts: 0 }).expire(this.k(`otp:${phone}`), ttlS).exec();
  }
  async get(phone: string) {
    const v = await this.r.hgetall(this.k(`otp:${phone}`));
    return v.hash ? { hash: v.hash, attempts: Number(v.attempts ?? 0) } : null;
  }
  async bump(phone: string) {
    const key = this.k(`otp:${phone}`);
    if (!(await this.r.exists(key))) return 0;
    return this.r.hincrby(key, "attempts", 1);
  }
  async del(phone: string) { await this.r.del(this.k(`otp:${phone}`)); }
  async hit(key: string, limit: number, windowS: number) {
    const k = this.k(`rl:${key}`);
    const n = await this.r.incr(k);
    if (n === 1) await this.r.expire(k, windowS);
    return n <= limit;
  }
}
