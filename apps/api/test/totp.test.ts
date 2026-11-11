import { describe, expect, it } from "vitest";
import { base32, fromBase32, newRecoveryCodes, newSecret, otpauthUrl, totp, verifyTotp } from "../src/modules/ops/totp";

describe("TOTP (RFC 6238)", () => {
  // RFC 6238 appendix B test vectors for SHA1 (secret "12345678901234567890"), truncated to 6 digits
  const secret = base32(Buffer.from("12345678901234567890"));
  it("matches the RFC test vectors", () => {
    for (const [t, expected] of [[59, "287082"], [1111111109, "081804"], [1111111111, "050471"], [1234567890, "005924"], [2000000000, "279037"], [20000000000, "353130"]] as const) expect(totp(secret, t * 1000)).toBe(expected);
  });
  it("base32 round-trips", () => { const b = Buffer.from("hawma-secret-bytes"); expect(fromBase32(base32(b)).equals(b)).toBe(true); expect(() => fromBase32("0189")).toThrow(); });
  it("accepts ±1 step of drift but not more, and rejects malformed codes", () => {
    const now = 1_700_000_000_000; const s = newSecret();
    expect(verifyTotp(s, totp(s, now), now)).toBe(true); expect(verifyTotp(s, totp(s, now - 30_000), now)).toBe(true); expect(verifyTotp(s, totp(s, now + 30_000), now)).toBe(true);
    expect(verifyTotp(s, totp(s, now - 120_000), now)).toBe(false);
    for (const bad of ["", "12345", "1234567", "abcdef", "12 456"]) expect(verifyTotp(s, bad, now)).toBe(false);
  });
  it("produces a scannable otpauth URL and well-formed recovery codes", () => {
    const u = otpauthUrl("ABCDEFGH", "admin@hawma.ma"); expect(u).toContain("otpauth://totp/Hawma%20Ops:admin%40hawma.ma?secret=ABCDEFGH"); expect(u).toContain("period=30");
    const codes = newRecoveryCodes(); expect(codes).toHaveLength(8); expect(new Set(codes).size).toBe(8); expect(codes[0]).toMatch(/^[0-9a-f]{5}-[0-9a-f]{5}$/);
  });
});
