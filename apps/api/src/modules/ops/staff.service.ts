import { Injectable, UnauthorizedException, ForbiddenException } from "@nestjs/common";
import { SignJWT, jwtVerify } from "jose";
import { randomBytes, scrypt as _scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { can, type Permission, type Role, ROLES } from "../../domain/rbac";

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

export interface StaffRecord { id: string; email: string; passwordHash: string; roles: Role[]; active: boolean }
export interface StaffRepo { byEmail(email: string): Promise<StaffRecord | undefined>; byId(id: string): Promise<StaffRecord | undefined> }
export class MemoryStaffRepo implements StaffRepo {
  items = new Map<string, StaffRecord>();
  async byEmail(email: string) { return [...this.items.values()].find((s) => s.email === email.toLowerCase()); }
  async byId(id: string) { return this.items.get(id); }
}
export interface Staff { id: string; email: string; roles: Role[] }

/** Staff tokens use a different secret AND audience than customer tokens, so a customer JWT can never reach /ops. */
@Injectable()
export class StaffService {
  private key = new TextEncoder().encode(process.env.OPS_JWT_SECRET ?? "dev-only-ops-secret-change-me-32-bytes!!!");
  private fails = new Map<string, { n: number; until: number }>();
  constructor(private repo: StaffRepo) {}

  async login(email: string, password: string) {
    const e = email.toLowerCase(), f = this.fails.get(e);
    if (f && f.until > Date.now() && f.n >= 5) throw new UnauthorizedException("account temporarily locked");
    const s = await this.repo.byEmail(e);
    // always run a hash to keep timing uniform whether or not the account exists
    const ok = await verifyPassword(password, s?.passwordHash ?? "scrypt$00$00");
    if (!s || !s.active || !ok) {
      const cur = this.fails.get(e) ?? { n: 0, until: 0 }; this.fails.set(e, { n: cur.n + 1, until: Date.now() + 15 * 60_000 });
      throw new UnauthorizedException("invalid credentials");
    }
    this.fails.delete(e);
    const token = await new SignJWT({ roles: s.roles, email: s.email }).setProtectedHeader({ alg: "HS256" }).setSubject(s.id).setAudience("ops").setIssuer("hawma").setIssuedAt().setExpirationTime("8h").sign(this.key);
    return { token, staff: { id: s.id, email: s.email, roles: s.roles } };
  }

  async authenticate(token: string): Promise<Staff> {
    try {
      const { payload } = await jwtVerify(token, this.key, { audience: "ops", issuer: "hawma" });
      const s = await this.repo.byId(payload.sub!);
      if (!s || !s.active) throw new Error("inactive");
      const roles = (payload.roles as Role[]).filter((r) => (ROLES as readonly string[]).includes(r) && s.roles.includes(r)); // roles revoked server-side take effect immediately
      return { id: s.id, email: s.email, roles };
    } catch { throw new UnauthorizedException("invalid staff token"); }
  }

  require(staff: Staff, p: Permission) { if (!can(staff.roles, p)) throw new ForbiddenException(`missing permission ${p}`); }
}
