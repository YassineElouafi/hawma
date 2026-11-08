import { BadRequestException, ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { REASON_REQUIRED, type Permission } from "../../domain/rbac";
import type { Staff } from "./staff.service";

export interface AuditEntry { id: number; at: string; actorId: string; action: string; target: string; reason?: string; meta: Record<string, unknown> }
export interface AuditRepo { append(e: Omit<AuditEntry, "id" | "at">): Promise<void>; list(limit: number): Promise<AuditEntry[]> }
export class MemoryAuditRepo implements AuditRepo {
  items: AuditEntry[] = [];
  async append(e: Omit<AuditEntry, "id" | "at">) { this.items.push({ ...e, id: this.items.length + 1, at: new Date().toISOString() }); }
  async list(limit: number) { return [...this.items].reverse().slice(0, limit); }
}

export interface Verification { id: string; userId: string; tier: number; status: "submitted" | "auto_passed" | "in_review" | "approved" | "rejected"; reason?: string; documents: string[]; createdAt: string }
export interface KycRepo {
  submit(userId: string, tier: number, documents: string[]): Promise<Verification>;
  forUser(userId: string): Promise<Verification[]>;
  list(status: Verification["status"][], limit: number): Promise<Verification[]>;
  get(id: string): Promise<Verification | undefined>;
  /** Atomic: status change + provider tier + AUDIT ROW in one transaction, so a decision can never exist without its audit entry. */
  decide(id: string, status: "approved" | "rejected", reviewerId: string, reason: string | undefined, expectedStatus: Verification["status"][], audit: Omit<AuditEntry, "id" | "at">): Promise<Verification | undefined>;
}
export class MemoryKycRepo implements KycRepo {
  items = new Map<string, Verification>(); tiers = new Map<string, number>();
  constructor(private auditRepo?: AuditRepo) {}
  async submit(userId: string, tier: number, documents: string[]) { const v: Verification = { id: crypto.randomUUID(), userId, tier, status: "in_review", documents, createdAt: new Date().toISOString() }; this.items.set(v.id, v); return v; }
  async forUser(userId: string) { return [...this.items.values()].filter((v) => v.userId === userId); }
  async list(status: Verification["status"][], limit: number) { return [...this.items.values()].filter((v) => status.includes(v.status)).slice(0, limit); }
  async get(id: string) { return this.items.get(id); }
  async decide(id: string, status: "approved" | "rejected", _r: string, reason: string | undefined, expected: Verification["status"][], audit: Omit<AuditEntry, "id" | "at">) {
    const v = this.items.get(id); if (!v || !expected.includes(v.status)) return undefined;
    await this.auditRepo?.append(audit); v.status = status; v.reason = reason; if (status === "approved") this.tiers.set(v.userId, Math.max(this.tiers.get(v.userId) ?? 0, v.tier)); return { ...v };
  }
}

@Injectable()
export class OpsService {
  constructor(private audit: AuditRepo, private kyc: KycRepo, readonly seeder?: () => Promise<{ created: number; total: number }>) {}
  auditNote(staff: Staff, action: string, target: string, reason: string, meta: Record<string, unknown>) { return this.audit.append({ actorId: staff.id, action, target, reason, meta }); }

  /** Every privileged action goes through here: reason enforced, audit written BEFORE the effect is reported. */
  private async record(staff: Staff, perm: Permission, action: string, target: string, reason: string | undefined, meta: Record<string, unknown> = {}) {
    if (REASON_REQUIRED.includes(perm) && (!reason || reason.trim().length < 5)) throw new BadRequestException("a reason of at least 5 characters is required");
    await this.audit.append({ actorId: staff.id, action, target, reason: reason?.trim(), meta });
  }

  /** Provider applies for a verification tier. One open application per user. */
  async submitVerification(userId: string, tier: number, documents: string[]) {
    if (![1, 2, 3].includes(tier)) throw new UnprocessableEntityException("tier must be 1, 2 or 3");
    const open = (await this.kyc.forUser(userId)).find((v) => v.status === "in_review" || v.status === "submitted");
    if (open) throw new ConflictException("you already have a verification in review");
    return this.kyc.submit(userId, tier, documents);
  }
  myVerifications(userId: string) { return this.kyc.forUser(userId); }

  async kycQueue(limit = 50) { return this.kyc.list(["in_review", "submitted"], limit); }

  async kycDecision(staff: Staff, id: string, decision: "approved" | "rejected", reason?: string) {
    const v = await this.kyc.get(id);
    if (!v) throw new NotFoundException();
    if (v.userId === staff.id) throw new ConflictException("you cannot review your own verification");
    if (decision === "rejected" && !reason) throw new UnprocessableEntityException("rejections need a reason shown to the provider");
    if (v.tier >= 3 && decision === "approved" && !staff.roles.includes("admin")) throw new ConflictException("tier 3 approvals require an admin");
    if (!("submitted in_review".split(" ") as string[]).includes(v.status)) throw new ConflictException("verification was already decided");
    const why = reason ?? "approved after document review";
    if (why.trim().length < 5) throw new BadRequestException("a reason of at least 5 characters is required"); // validate BEFORE any effect
    const done = await this.kyc.decide(id, decision, staff.id, reason, ["submitted", "in_review"], { actorId: staff.id, action: `kyc.${decision}`, target: id, reason: why.trim(), meta: { tier: v.tier, userId: v.userId } });
    if (!done) throw new ConflictException("verification was already decided");
    return done;
  }

  async auditLog(limit = 100) { return this.audit.list(limit); }
}
