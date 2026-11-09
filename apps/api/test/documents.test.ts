import "reflect-metadata";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { randomUUID } from "node:crypto";
import { createApp } from "../src/main";
import { OVERRIDES } from "../src/app.module";
import { DocCrypto, sniffImage } from "../src/modules/documents/crypto";
import { hashPassword } from "../src/modules/ops/staff.service";

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(200, 7)]);
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 9)]);

describe("DocCrypto", () => {
  it("round-trips, uses fresh nonces, and binds ciphertext to its context", () => {
    const c = new DocCrypto(); const a = c.encrypt(PNG, "v1:cin_front"), b = c.encrypt(PNG, "v1:cin_front");
    expect(a.nonce).not.toBe(b.nonce); expect(a.data.equals(b.data)).toBe(false);
    expect(c.decrypt(a.nonce, a.data, "v1:cin_front").equals(PNG)).toBe(true);
    expect(() => c.decrypt(a.nonce, a.data, "v1:selfie")).toThrow();                      // swapped context is rejected
    const t = Buffer.from(a.data); t[3] ^= 1; expect(() => c.decrypt(a.nonce, t, "v1:cin_front")).toThrow(); // tampering detected
    expect(() => new DocCrypto(Buffer.alloc(8).toString("base64"))).toThrow(/32 bytes/);
    expect(() => new DocCrypto().decrypt(a.nonce, a.data, "v1:cin_front")).toThrow();     // other key cannot read
  });
  it("sniffs real image types only", () => {
    expect(sniffImage(PNG)).toBe("image/png"); expect(sniffImage(JPG)).toBe("image/jpeg");
    expect(sniffImage(Buffer.from("<html><script>alert(1)</script></html>"))).toBeNull(); expect(sniffImage(Buffer.from("%PDF-1.4 ...."))).toBeNull();
  });
});

let app: NestFastifyApplication;
beforeAll(async () => { app = await createApp(); await app.init(); await app.getHttpAdapter().getInstance().ready(); });
afterAll(async () => { await app.close(); });
const req = (method: "GET" | "POST", url: string, token?: string, payload?: object) => app.inject({ method, url, payload, headers: token ? { authorization: `Bearer ${token}` } : {} });
async function user(phone: string) { await req("POST", "/v1/auth/otp/request", undefined, { phone }); return (await req("POST", "/v1/auth/otp/verify", undefined, { phone, code: OVERRIDES.otpSender.last.get(phone.replace(/^0/, "+212"))! })).json(); }
async function staff(roles: string[]) { const id = randomUUID(), email = `${id.slice(0, 6)}@hawma.ma`; OVERRIDES.staffRepo.items.set(id, { id, email, passwordHash: await hashPassword("correct horse battery"), roles: roles as never, active: true }); return (await req("POST", "/ops/login", undefined, { email, password: "correct horse battery" })).json().token as string; }

describe("KYC documents over HTTP", () => {
  it("owner uploads, staff views (audited), strangers and bad files are refused", async () => {
    const p = await user("0641414141"), stranger = await user("0642424242");
    const ver = (await req("POST", "/v1/verifications", p.accessToken, { tier: 1, documents: ["cin_front", "selfie"] })).json();
    const url = `/v1/verifications/${ver.id}/documents`;
    expect((await req("POST", url, undefined, { kind: "cin_front", data: PNG.toString("base64") })).statusCode).toBe(401);
    expect((await req("POST", url, stranger.accessToken, { kind: "cin_front", data: PNG.toString("base64") })).statusCode).toBe(403);
    expect((await req("POST", url, p.accessToken, { kind: "passport", data: PNG.toString("base64") })).statusCode).toBe(400);
    expect((await req("POST", url, p.accessToken, { kind: "cin_front", data: Buffer.from("<script>alert(1)</script>".repeat(10)).toString("base64") })).statusCode).toBe(400);
    expect((await req("POST", url, p.accessToken, { kind: "cin_front", data: Buffer.concat([PNG, Buffer.alloc(3.2 * 1024 * 1024)]).toString("base64") })).statusCode).toBe(413);
    const ok = await req("POST", url, p.accessToken, { kind: "cin_front", data: PNG.toString("base64") });
    expect(ok.statusCode).toBe(201); expect(ok.json()).toMatchObject({ kind: "cin_front", mime: "image/png", size: PNG.length });
    expect(ok.json()).not.toHaveProperty("ciphertext");
    expect((await req("POST", url, p.accessToken, { kind: "selfie", data: JPG.toString("base64") })).statusCode).toBe(201);
    expect((await req("GET", url, p.accessToken)).json()).toHaveLength(2);
    expect((await req("GET", url, stranger.accessToken)).statusCode).toBe(404);

    const ts = await staff(["trust_safety"]), sup = await staff(["catalogue"]);
    const metas = (await req("GET", `/ops/kyc/${ver.id}/documents`, ts)).json();
    expect(metas).toHaveLength(2);
    expect((await req("GET", `/ops/documents/${metas[0].id}`, sup)).statusCode).toBe(403);          // role without kyc.read
    expect((await req("GET", `/ops/documents/${metas[0].id}`, p.accessToken)).statusCode).toBe(401); // customer token is not staff
    const before = OVERRIDES.auditRepo.items.length;
    const img = await req("GET", `/ops/documents/${metas[0].id}`, ts);
    expect(img.statusCode).toBe(200); expect(img.headers["content-type"]).toBe("image/png"); expect(img.headers["cache-control"]).toContain("no-store");
    expect(Buffer.from(img.rawPayload).equals(PNG)).toBe(true);                                      // decrypts to the original bytes
    expect(OVERRIDES.auditRepo.items.length).toBe(before + 1);
    expect(OVERRIDES.auditRepo.items.at(-1)).toMatchObject({ action: "kyc.document.view", target: ver.id });
  });

  it("decided verifications no longer accept uploads", async () => {
    const p = await user("0643434343"); const ver = (await req("POST", "/v1/verifications", p.accessToken, { tier: 1, documents: ["selfie"] })).json();
    const ts = await staff(["trust_safety"]);
    await req("POST", `/ops/kyc/${ver.id}/approve`, ts, { reason: "documents already verified" });
    expect((await req("POST", `/v1/verifications/${ver.id}/documents`, p.accessToken, { kind: "selfie", data: PNG.toString("base64") })).statusCode).toBe(409);
  });
});
