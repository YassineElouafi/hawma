import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";
import { ChainOtpSender, senderFromEnv, WebhookSmsSender, WhatsAppCloudSender } from "../src/modules/auth/otp-senders";
import { ConsoleOtpSender } from "../src/modules/auth/auth.service";

let srv: Server; let base: string; const hits: { url: string; auth?: string; body: any }[] = []; let mode: "ok" | "fail" = "ok";
beforeAll(async () => {
  srv = createServer((req, res) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => { hits.push({ url: req.url!, auth: req.headers.authorization, body: JSON.parse(b || "{}") }); res.statusCode = mode === "ok" ? 200 : 500; res.end("{}"); }); });
  await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r)); base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => srv.close(() => r())));

describe("OTP senders", () => {
  it("WhatsApp: calls the Cloud API with the template, token and digits-only recipient", async () => {
    mode = "ok"; hits.length = 0;
    await new WhatsAppCloudSender({ phoneNumberId: "123", token: "tok", template: "otp_code", baseUrl: base }).send("+212611223344", "482913");
    expect(hits[0].url).toBe("/123/messages"); expect(hits[0].auth).toBe("Bearer tok");
    expect(hits[0].body).toMatchObject({ messaging_product: "whatsapp", to: "212611223344", type: "template", template: { name: "otp_code", language: { code: "fr" } } });
    expect(JSON.stringify(hits[0].body)).toContain("482913");
  });
  it("SMS webhook: posts to/text with bearer token", async () => {
    mode = "ok"; hits.length = 0;
    await new WebhookSmsSender({ url: base + "/sms", token: "s3", sender: "Hawma" }).send("+212611223344", "111222");
    expect(hits[0]).toMatchObject({ url: "/sms", auth: "Bearer s3", body: { to: "+212611223344", from: "Hawma" } }); expect(hits[0].body.text).toContain("111222");
  });
  it("errors surface as exceptions", async () => {
    mode = "fail";
    await expect(new WebhookSmsSender({ url: base + "/sms" }).send("+212611223344", "1")).rejects.toThrow(/sms send failed: 500/);
  });
  it("chain falls back to the next sender and reports the failure", async () => {
    const calls: string[] = []; const errs: number[] = [];
    const bad = { send: async () => { calls.push("wa"); throw new Error("down"); } }, good = { send: async () => { calls.push("sms"); } };
    await new ChainOtpSender([bad, good], (i) => errs.push(i)).send("+212611223344", "1");
    expect(calls).toEqual(["wa", "sms"]); expect(errs).toEqual([0]);
    await expect(new ChainOtpSender([bad, bad]).send("x", "1")).rejects.toThrow("down");
  });
  it("env selection: none → console fallback; whatsapp+sms → chain", () => {
    const fb = new ConsoleOtpSender();
    expect(senderFromEnv({}, fb)).toEqual({ sender: fb, kind: ["console"] });
    expect(senderFromEnv({ WHATSAPP_PHONE_NUMBER_ID: "1", WHATSAPP_TOKEN: "t", WHATSAPP_TEMPLATE: "x", SMS_WEBHOOK_URL: "http://x" } as NodeJS.ProcessEnv).kind).toEqual(["whatsapp", "sms"]);
    expect(senderFromEnv({ WHATSAPP_PHONE_NUMBER_ID: "1" } as NodeJS.ProcessEnv, fb).kind).toEqual(["console"]);
  });
});
