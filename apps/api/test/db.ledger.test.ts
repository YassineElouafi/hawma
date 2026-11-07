import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { randomUUID } from "node:crypto";

const url = process.env.DATABASE_URL;
const d = url ? describe : describe.skip; // runs in CI against a real Postgres service

d("database invariants (real Postgres)", () => {
  let sql: ReturnType<typeof postgres>;
  beforeAll(() => { sql = postgres(url!, { max: 2 }); });
  afterAll(async () => { await sql.end(); });

  it("accepts a balanced transaction", async () => {
    const txn = randomUUID();
    await sql.begin(async (t) => {
      await t`insert into money.ledger_entry (txn_id, kind, account, amount_centimes) values (${txn}, 'test', 'platform_float', 100)`;
      await t`insert into money.ledger_entry (txn_id, kind, account, amount_centimes) values (${txn}, 'test', 'platform_revenue', -100)`;
    });
    const [{ n }] = await sql`select count(*)::int as n from money.ledger_entry where txn_id = ${txn}`;
    expect(n).toBe(2);
  });

  it("rejects an unbalanced transaction at commit", async () => {
    const txn = randomUUID();
    await expect(sql.begin(async (t) => {
      await t`insert into money.ledger_entry (txn_id, kind, account, amount_centimes) values (${txn}, 'test', 'platform_float', 100)`;
      await t`insert into money.ledger_entry (txn_id, kind, account, amount_centimes) values (${txn}, 'test', 'platform_revenue', -99)`;
    })).rejects.toThrow(/unbalanced/);
    const [{ n }] = await sql`select count(*)::int as n from money.ledger_entry where txn_id = ${txn}`;
    expect(n).toBe(0);
  });

  it("ledger is append-only", async () => {
    const txn = randomUUID();
    await sql.begin(async (t) => {
      await t`insert into money.ledger_entry (txn_id, kind, account, amount_centimes) values (${txn}, 'test', 'platform_float', 5)`;
      await t`insert into money.ledger_entry (txn_id, kind, account, amount_centimes) values (${txn}, 'test', 'platform_revenue', -5)`;
    });
    await expect(sql`update money.ledger_entry set amount_centimes = 1 where txn_id = ${txn}`).rejects.toThrow(/append-only/);
    await expect(sql`delete from money.ledger_entry where txn_id = ${txn}`).rejects.toThrow(/append-only/);
  });

  it("one review per author per booking; rating range enforced", async () => {
    const cust = randomUUID(), prov = randomUUID(), author = randomUUID();
    const [b] = await sql`insert into booking.booking (customer_id, lat, lng) values (${cust}, 33.58, -7.63) returning id`;
    await sql`insert into booking.review (booking_id, author_id, subject_id, rating) values (${b.id}, ${author}, ${prov}, 5)`;
    await expect(sql`insert into booking.review (booking_id, author_id, subject_id, rating) values (${b.id}, ${author}, ${prov}, 4)`).rejects.toThrow();
    await expect(sql`insert into booking.review (booking_id, author_id, subject_id, rating) values (${b.id}, ${randomUUID()}, ${prov}, 9)`).rejects.toThrow(/rating_range/);
  });

  it("booking fee cannot exceed total", async () => {
    await expect(sql`insert into booking.booking (customer_id, lat, lng, total_centimes, fee_centimes) values (${randomUUID()}, 1, 1, 100, 200)`).rejects.toThrow(/amounts_nonneg/);
  });
});
