import { Body, Controller, Get, Headers, Inject, Param, Post, Res, UnauthorizedException } from "@nestjs/common";
import { z } from "zod";
import { AuthService } from "../auth/auth.service";
import { StaffService } from "../ops/staff.service";
import { OpsService } from "../ops/ops.service";
import { DOC_KINDS, DocumentsService } from "./documents.service";

const upload = z.object({ kind: z.enum(DOC_KINDS), data: z.string().min(100).max(4_500_000) });

@Controller()
export class DocumentsController {
  constructor(@Inject(DocumentsService) private docs: DocumentsService, @Inject(AuthService) private auth: AuthService, @Inject(StaffService) private staff: StaffService, @Inject(OpsService) private ops: OpsService) {}
  private async uid(h?: string) { if (!h?.startsWith("Bearer ")) throw new UnauthorizedException(); return this.auth.verify(h.slice(7)); }
  private async me(h?: string) { if (!h?.startsWith("Bearer ")) throw new UnauthorizedException(); return this.staff.authenticate(h.slice(7)); }

  @Post("v1/verifications/:id/documents") async add(@Headers("authorization") h: string, @Param("id") id: string, @Body() b: unknown) { const v = upload.parse(b); return this.docs.upload(await this.uid(h), id, v.kind, v.data); }
  @Get("v1/verifications/:id/documents") async mine(@Headers("authorization") h: string, @Param("id") id: string) { return this.docs.mine(await this.uid(h), id); }

  @Get("ops/kyc/:id/documents") async list(@Headers("authorization") h: string, @Param("id") id: string) { const s = await this.me(h); this.staff.require(s, "kyc.read"); return this.docs.listFor(id); }
  @Get("ops/documents/:docId") async view(@Headers("authorization") h: string, @Param("docId") docId: string, @Res() res: { header: (k: string, v: string) => typeof res; send: (b: Buffer) => void }) {
    const s = await this.me(h); this.staff.require(s, "kyc.read");
    const { meta, bytes } = await this.docs.read(docId);
    await this.ops.auditNote(s, "kyc.document.view", meta.verificationId, "document viewed during review", { documentId: docId, kind: meta.kind });
    res.header("content-type", meta.mime).header("cache-control", "private, no-store").header("x-content-type-options", "nosniff").send(bytes);
  }
}
