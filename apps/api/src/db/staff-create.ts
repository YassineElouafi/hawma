/** Usage: DATABASE_URL=… tsx src/db/staff-create.ts email roles,comma,separated   (password read from STAFF_PASSWORD env, never argv) */
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { PgStaffRepo } from "../modules/ops/pg-staff.repo";
import type { Role } from "../domain/rbac";

const [email, roles] = process.argv.slice(2);
const pw = process.env.STAFF_PASSWORD;
if (!process.env.DATABASE_URL || !email || !roles || !pw) { console.error("need DATABASE_URL, STAFF_PASSWORD, <email> <roles>"); process.exit(1); }
const sql = postgres(process.env.DATABASE_URL, { max: 1 });
const rec = await new PgStaffRepo(drizzle(sql)).upsert(email, pw, roles.split(",") as Role[]);
console.log(`staff ready: ${rec.email} [${rec.roles.join(", ")}] id=${rec.id}`);
await sql.end();
