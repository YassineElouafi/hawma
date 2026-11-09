import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, PayloadTooLargeException } from "@nestjs/common";
import { DocCrypto, sniffImage } from "./crypto";

export const DOC_KINDS = ["cin_front", "cin_back", "selfie", "address_proof", "criminal_record", "trade_licence", "insurance"] as const;
export interface DocMeta { id: string; verificationId: string; userId: string; kind: string; mime: string; size: number; createdAt: string }
export interface DocRepo {
  add(m: Omit<DocMeta, "id" | "createdAt">, nonce: string, data: Buffer): Promise<DocMeta>;
  list(verificationId: string): Promise<DocMeta[]>;
  get(id: string): Promise<{ meta: DocMeta; nonce: string; data: Buffer } | undefined>;
  verificationOwner(verificationId: string): Promise<{ userId: string; status: string } | undefined>;
}
export class MemoryDocRepo implements DocRepo {
  items = new Map<string, { meta: DocMeta; nonce: string; data: Buffer }>();
  constructor(private lookup: (verificationId: string) => { userId: string; status: string } | undefined = () => undefined) {}
  async add(m: Omit<DocMeta, "id" | "createdAt">, nonce: string, data: Buffer) { const meta = { ...m, id: crypto.randomUUID(), createdAt: new Date().toISOString() }; this.items.set(meta.id, { meta, nonce, data }); return meta; }
  async list(v: string) { return [...this.items.values()].map((x) => x.meta).filter((m) => m.verificationId === v); }
  async get(id: string) { return this.items.get(id); }
  async verificationOwner(v: string) { return this.lookup(v); }
}

export const MAX_DOC_BYTES = 3 * 1024 * 1024;
export const MAX_DOCS_PER_VERIFICATION = 10;

@Injectable()
export class DocumentsService {
  constructor(@Inject("DOC_REPO") private repo: DocRepo, @Inject("DOC_CRYPTO") private crypto: DocCrypto) {}

  async upload(userId: string, verificationId: string, kind: string, base64: string) {
    if (!(DOC_KINDS as readonly string[]).includes(kind)) throw new BadRequestException("unknown document kind");
    const v = await this.repo.verificationOwner(verificationId);
    if (!v) throw new NotFoundException();
    if (v.userId !== userId) throw new ForbiddenException();
    if (!["in_review", "submitted"].includes(v.status)) throw new ConflictException("this verification is already decided");
    const raw = Buffer.from(base64, "base64");
    if (raw.length === 0) throw new BadRequestException("empty file");
    if (raw.length > MAX_DOC_BYTES) throw new PayloadTooLargeException("document is larger than 3 MB");
    const mime = sniffImage(raw);
    if (!mime) throw new BadRequestException("only JPEG, PNG or WebP images are accepted");
    if ((await this.repo.list(verificationId)).length >= MAX_DOCS_PER_VERIFICATION) throw new ConflictException("too many documents");
    const { nonce, data } = this.crypto.encrypt(raw, `${verificationId}:${kind}`);
    return this.repo.add({ verificationId, userId, kind, mime, size: raw.length }, nonce, data);
  }
  listFor(verificationId: string) { return this.repo.list(verificationId); }
  async mine(userId: string, verificationId: string) { const v = await this.repo.verificationOwner(verificationId); if (!v || v.userId !== userId) throw new NotFoundException(); return this.repo.list(verificationId); }
  async read(id: string) {
    const d = await this.repo.get(id); if (!d) throw new NotFoundException();
    return { meta: d.meta, bytes: this.crypto.decrypt(d.nonce, d.data, `${d.meta.verificationId}:${d.meta.kind}`) };
  }
}
