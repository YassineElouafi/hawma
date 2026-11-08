import { describe, it } from "vitest";
import postgres from "postgres";
const url = process.env.DATABASE_URL;
(url ? describe : describe.skip)("tz diag", () => {
  it("prints", async () => {
    const sql = postgres(url!);
    const r = await sql`select (timestamptz '2026-11-10T09:00:00Z' at time zone 'Africa/Casablanca')::text a, (timestamptz '2026-03-10T09:00:00Z' at time zone 'Africa/Casablanca')::text b, (timestamptz '2026-11-10T09:00:00Z' at time zone 'Europe/Paris')::text c, version() v`;
    console.log("TZDIAG", JSON.stringify(r[0]));
    await sql.end();
  });
});
