import { Injectable, UnauthorizedException, ForbiddenException } from "@nestjs/common";
import { SignJWT, jwtVerify } from "jose";
import { randomBytes, scrypt as _scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { can, type Permission, type Role, ROLES } from "../../domain/rbac";
import { DocCrypto } from "../documents/crypto";
import { newRecoveryCodes, newSecret, otpauthUrl, verifyTotp } from "./totp";
import { createHash } from "node:crypto";
import { BadRequestException, ConflictException } from "@nestjs/common";

const scrypt = promisify(_scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString("hex")}$${(await scrypt(pw, salt, 64)).toString("hex")}`;
}
export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [, saltHex, hashHex] = stored.split("$");
  if (!saltHex || !hashHex) return false;
  const h = await scrypt(pw, Buffer.from(saltHex, "hex"), 64);
  const expected = Buffer.from(hashHex, "hex");
  return h.length === expected.length && timingSafeEqual(h, expected);
}

export interface StaffRecord { id: string; email: string; passwordHash: string; roles: Role[]; active: boolean; mfaSecret?: string | null; mfaEnabled?: boolean; mfaRecovery?: string[] }
export interface StaffRepo { byEmail(email: string): Promise<StaffRecord | undefined>; byId(id: string): Promise<StaffRecord | undefined>; saveMfa(id: string, patch: { mfaSecret?: string | null; mfaEnabled?: boolean; mfaRecovery?: string[] }): Promise<void> }
export class MemoryStaffRepo implements StaffRepo {
  items = new Map<string, StaffRecord>();
  async byEmail(email: string) { return [...this.items.values()].find((s) => s.email === email.toLowerCase()); }
  async byId(id: string) { return this.items.get(id); }
  async saveMfa(id: string, patch: { mfaSecret?: string | null; mfaEnabled?: boolean; mfaRecovery?: string[] }) { const s = this.items.get(id); if (s) Object.assign(s, patch); }
}
export interface Staff { id: string; email: string; roles: Role[]; mfa: boolean }
/** Actions that require MFA when OPS_REQUIRE_MFA=true (money, identity decisions, account control). */
export const MFA_SENSITIVE: Permission[] = ["staff.manage", "refunds.issue", "payouts.approve", "kyc.review", "disputes.resolve", "users.suspend"];
const rh = (id: string, code: string) => createHash("sha256").update(`${id}:${code.toLowerCase().trim()}`).digest("hex");

/** Staff tokens use a different secret AND audience than customer tokens, so a customer JWT can never reach /ops. */
@Injectable()
export class StaffService {
  private key = new TextEncoder().encode(process.env.OPS_JWT_SECRET ?? "dev-only-ops-secret-change-me-32-bytes!!!");
  private fails = new Map<string, { n: number; until: number }>();
  constructor(private repo: StaffRepo, private crypto: DocCrypto = new DocCrypto(process.env.KYC_ENC_KEY), private env: NodeJS.ProcessEnv = process.env) {}

  async login(email: string, password: string, mfaCode?: string) {
    const e = email.toLowerCase(), f = this.fails.get(e);
    if (f && f.until > Date.now() && f.n >= 5) throw new UnauthorizedException("account temporarily locked");
    const s = await this.repo.byEmail(e);
    // always run a hash to keep timing uniform whether or not the account exists
    const ok = await verifyPassword(password, s?.passwordHash ?? "scrypt$00$00");
    if (!s || !s.active || !ok) {
      const cur = this.fails.get(e) ?? { n: 0, until: 0 }; this.fails.set(e, { n: cur.n + 1, until: Date.now() + 15 * 60_000 });
      throw new UnauthorizedException("invalid credentials");
    }
    if (s.mfaEnabled) {
      if (!mfaCode) throw new UnauthorizedException("mfa_required");                       // password was right: ask for the second factor (does not count as a failure)
      if (!(await this.checkSecondFactor(s, mfaCode))) { const cur = this.fails.get(e) ?? { n: 0, until: 0 }; this.fails.set(e, { n: cur.n + 1, until: Date.now() + 15 * 60_000 }); throw new UnauthorizedException("invalid credentials"); }
    }
    this.fails.delete(e);
    const token = await new SignJWT({ roles: s.roles, email: s.email, mfa: !!s.mfaEnabled }).setProtectedHeader({ alg: "HS256" }).setSubject(s.id).setAudience("ops").setIssuer("hawma").setIssuedAt().setExpirationTime("8h").sign(this.key);
    return { token, staff: { id: s.id, email: s.email, roles: s.roles, mfa: !!s.mfaEnabled } };
  }

  async authenticate(token: string): Promise<Staff> {
    try {
      const { payload } = await jwtVerify(token, this.key, { audience: "ops", issuer: "hawma" });
      const s = await this.repo.byId(payload.sub!);
      if (!s || !s.active) throw new Error("inactive");
      const roles = (payload.roles as Role[]).filter((r) => (ROLES as readonly string[]).includes(r) && s.roles.includes(r)); // roles revoked server-side take effect immediately
      return { id: s.id, email: s.email, roles, mfa: !!s.mfaEnabled && payload.mfa === true };
    } catch { throw new UnauthorizedException("invalid staff token"); }
  }

  require(staff: Staff, p: Permission) {
    if (!can(staff.roles, p)) throw new ForbiddenException(`missing permission ${p}`);
    if (this.env.OPS_REQUIRE_MFA === "true" && MFA_SENSITIVE.includes(p) && !staff.mfa) throw new ForbiddenException("mfa_required: enable two-factor authentication to perform this action");
  }

  private async checkSecondFactor(s: StaffRecord, code: string): Promise<boolean> {
    const secret = s.mfaSecret ? this.decryptSecret(s.id, s.mfaSecret) : undefined;
    if (secret && verifyTotp(secret, code.replace(/\s/g, ""))) return true;
    const h = rh(s.id, code); const rec = s.mfaRecovery ?? [];
    if (rec.includes(h)) { await this.repo.saveMfa(s.id, { mfaRecovery: rec.filter((x) => x !== h) }); return true; }   // recovery codes are single-use
    return false;
  }
  private encryptSecret(id: string, secret: string) { const e = this.crypto.encrypt(Buffer.from(secret), `mfa:${id}`); return `${e.nonce}:${e.data.toString("base64")}`; }
  private decryptSecret(id: string, stored: string) { const [n, d] = stored.split(":"); return this.crypto.decrypt(n, Buffer.from(d, "base64"), `mfa:${id}`).toString(); }

  /** Step 1: generate a secret (not active until a valid code is confirmed). */
  async mfaSetup(staff: Staff) {
    const rec = await this.repo.byId(staff.id); if (!rec) throw new UnauthorizedException(); if (rec.mfaEnabled) throw new ConflictException("two-factor authentication is already enabled");
    const secret = newSecret(); await this.repo.saveMfa(staff.id, { mfaSecret: this.encryptSecret(staff.id, secret), mfaEnabled: false });
    return { secret, otpauthUrl: otpauthUrl(secret, staff.email) };
  }
  /** Step 2: confirm with a code from the authenticator app; returns single-use recovery codes (shown once). */
  async mfaEnable(staff: Staff, code: string) {
    const rec = await this.repo.byId(staff.id); if (!rec?.mfaSecret) throw new BadRequestException("start setup first");
    if (rec.mfaEnabled) throw new ConflictException("already enabled");
    if (!verifyTotp(this.decryptSecret(staff.id, rec.mfaSecret), code)) throw new BadRequestException("that code is not valid — check your authenticator's clock");
    const codes = newRecoveryCodes(); await this.repo.saveMfa(staff.id, { mfaEnabled: true, mfaRecovery: codes.map((c) => rh(staff.id, c)) });
    return { enabled: true, recoveryCodes: codes };
  }
  async mfaDisable(staff: Staff, code: string) {
    const rec = await this.repo.byId(staff.id); if (!rec?.mfaEnabled) throw new BadRequestException("two-factor authentication is not enabled");
    if (!(await this.checkSecondFactor(rec, code))) throw new BadRequestException("invalid code");
    await this.repo.saveMfa(staff.id, { mfaEnabled: false, mfaSecret: null, mfaRecovery: [] }); return { enabled: false };
  }
}
