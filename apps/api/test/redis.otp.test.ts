import { afterAll, beforeAll, describe, expect, it } from "vitest";
import Redis from "ioredis";
import { RedisOtpStore } from "../src/modules/auth/redis-otp.store";
import { AuthService, ConsoleOtpSender } from "../src/modules/auth/auth.service";

const url = process.env.REDIS_URL;
const d = url ? describe : describe.skip;

d("Redis OTP store (real Redis)", () => {
  let r: Redis; let store: RedisOtpStore; const sender = new ConsoleOtpSender(); let auth: AuthService;
  beforeAll(() => { r = new Redis(url!); store = new RedisOtpStore(r, `test${Date.now()}:`); auth = new AuthService(store, sender); });
  afterAll(async () => { await r.quit(); });

  it("issues, verifies once, then rejects reuse", async () => {
    await auth.requestOtp("0610000001");
    const code = sender.last.get("+212610000001")!;
    expect((await auth.verifyOtp("0610000001", code)).accessToken).toBeTruthy();
    await expect(auth.verifyOtp("0610000001", code)).rejects.toThrow(/expired|requested/);
  });

  it("locks after 5 wrong attempts", async () => {
    await auth.requestOtp("0610000002");
    for (let i = 0; i < 5; i++) await expect(auth.verifyOtp("0610000002", "000000")).rejects.toThrow(/wrong code/);
    await expect(auth.verifyOtp("0610000002", "000000")).rejects.toThrow(/too many attempts/);
    const code = sender.last.get("+212610000002")!;
    await expect(auth.verifyOtp("0610000002", code)).rejects.toThrow(/expired|requested/);
  });

  it("rate-limits requests per phone", async () => {
    for (let i = 0; i < 3; i++) await auth.requestOtp("0610000003");
    await expect(auth.requestOtp("0610000003")).rejects.toThrow(/too many/);
  });

  it("codes expire with the TTL", async () => {
    await store.set("+212610000004", "h", 1);
    expect(await store.get("+212610000004")).not.toBeNull();
    await new Promise((res) => setTimeout(res, 1300));
    expect(await store.get("+212610000004")).toBeNull();
  });
});
