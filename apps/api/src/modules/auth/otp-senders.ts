import type { OtpSender } from "./auth.service";
import { ConsoleOtpSender } from "./auth.service";

/** WhatsApp Cloud API (Meta) authentication template. Requires an approved template with a single body variable. */
export class WhatsAppCloudSender implements OtpSender {
  constructor(private o: { phoneNumberId: string; token: string; template: string; language?: string; baseUrl?: string; fetchImpl?: typeof fetch }) {}
  async send(phone: string, code: string) {
    const f = this.o.fetchImpl ?? fetch;
    const res = await f(`${this.o.baseUrl ?? "https://graph.facebook.com/v20.0"}/${this.o.phoneNumberId}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.o.token}` },
      body: JSON.stringify({
        messaging_product: "whatsapp", to: phone.replace(/^\+/, ""), type: "template",
        template: { name: this.o.template, language: { code: this.o.language ?? "fr" }, components: [
          { type: "body", parameters: [{ type: "text", text: code }] },
          { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: code }] }, // "copy code" button used by authentication templates
        ] },
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`whatsapp send failed: ${res.status}`);
  }
}

/** Generic SMS gateway adapter: POSTs {to, text} as JSON to a provider/webhook URL. Fit to the chosen Moroccan SMS vendor's API. */
export class WebhookSmsSender implements OtpSender {
  constructor(private o: { url: string; token?: string; sender?: string; fetchImpl?: typeof fetch }) {}
  async send(phone: string, code: string) {
    const f = this.o.fetchImpl ?? fetch;
    const res = await f(this.o.url, {
      method: "POST", headers: { "content-type": "application/json", ...(this.o.token ? { authorization: `Bearer ${this.o.token}` } : {}) },
      body: JSON.stringify({ to: phone, from: this.o.sender ?? "Hawma", text: `Hawma: ton code est ${code}. Valable 5 min. Ne le partage avec personne.` }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`sms send failed: ${res.status}`);
  }
}

/** Tries each sender in order (e.g. WhatsApp first, SMS fallback). Fails only if all fail; never logs the code. */
export class ChainOtpSender implements OtpSender {
  constructor(private senders: OtpSender[], private onError: (i: number, e: unknown) => void = () => {}) {}
  async send(phone: string, code: string) {
    let last: unknown;
    for (let i = 0; i < this.senders.length; i++) { try { await this.senders[i].send(phone, code); return; } catch (e) { last = e; this.onError(i, e); } }
    throw last ?? new Error("no OTP sender configured");
  }
}

export function senderFromEnv(env: NodeJS.ProcessEnv, fallback: OtpSender = new ConsoleOtpSender()): { sender: OtpSender; kind: string[] } {
  const list: OtpSender[] = []; const kind: string[] = [];
  if (env.WHATSAPP_PHONE_NUMBER_ID && env.WHATSAPP_TOKEN && env.WHATSAPP_TEMPLATE) { list.push(new WhatsAppCloudSender({ phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID, token: env.WHATSAPP_TOKEN, template: env.WHATSAPP_TEMPLATE, language: env.WHATSAPP_LANG })); kind.push("whatsapp"); }
  if (env.SMS_WEBHOOK_URL) { list.push(new WebhookSmsSender({ url: env.SMS_WEBHOOK_URL, token: env.SMS_TOKEN, sender: env.SMS_SENDER })); kind.push("sms"); }
  if (!list.length) return { sender: fallback, kind: ["console"] };
  return { sender: new ChainOtpSender(list, (i, e) => console.warn(`otp sender #${i} (${kind[i]}) failed: ${(e as Error).message}`)), kind };
}
