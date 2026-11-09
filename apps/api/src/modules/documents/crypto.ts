import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/** AES-256-GCM envelope for KYC documents. Key comes from KYC_ENC_KEY (base64, 32 bytes); documents are unreadable without it even with DB access. */
export class DocCrypto {
  private key: Buffer;
  constructor(keyB64?: string) {
    const k = keyB64 ? Buffer.from(keyB64, "base64") : randomBytes(32); // random key ⇒ dev/test only (documents vanish on restart)
    if (k.length !== 32) throw new Error("KYC_ENC_KEY must be 32 bytes (base64)");
    this.key = k;
  }
  encrypt(plain: Buffer, aad: string) {
    const nonce = randomBytes(12); const c = createCipheriv("aes-256-gcm", this.key, nonce); c.setAAD(Buffer.from(aad));
    const enc = Buffer.concat([c.update(plain), c.final()]);
    return { nonce: nonce.toString("base64"), data: Buffer.concat([enc, c.getAuthTag()]) };
  }
  decrypt(nonceB64: string, data: Buffer, aad: string) {
    const d = createDecipheriv("aes-256-gcm", this.key, Buffer.from(nonceB64, "base64")); d.setAAD(Buffer.from(aad));
    d.setAuthTag(data.subarray(data.length - 16));
    return Buffer.concat([d.update(data.subarray(0, data.length - 16)), d.final()]);
  }
}

/** Sniff the real type from magic bytes; never trust the client's declared mime. */
export function sniffImage(b: Buffer): "image/jpeg" | "image/png" | "image/webp" | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (b.length > 12 && b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WEBP") return "image/webp";
  return null;
}
