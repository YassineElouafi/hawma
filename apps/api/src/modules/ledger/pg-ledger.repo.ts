import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { assertBalanced, type Account, type Txn } from "../../domain/ledger";
import type { LedgerRepo } from "./ledger.service";

export class PgLedgerRepo implements LedgerRepo {
  constructor(private db: PostgresJsDatabase) {}
  async post(t: Txn) {
    assertBalanced(t);
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${t.id}, 0))`);           // serialise concurrent posts of the same txn
      const ex = await tx.execute(sql`select 1 from money.ledger_entry where txn_id = ${t.id}::uuid limit 1`);
      if ([...ex].length) return false;
      for (const e of t.entries) await tx.execute(sql`insert into money.ledger_entry (txn_id, kind, account, owner_id, amount_centimes) values (${t.id}::uuid, ${t.kind}, ${e.account}, ${e.owner ?? null}::uuid, ${e.amount})`);
      return true;                                                                                  // balance is enforced by the deferred constraint trigger at COMMIT
    });
  }
  async balance(account: Account, ownerId?: string) {
    const r = await this.db.execute<{ s: string | null }>(ownerId ? sql`select sum(amount_centimes)::bigint s from money.ledger_entry where account = ${account} and owner_id = ${ownerId}::uuid` : sql`select sum(amount_centimes)::bigint s from money.ledger_entry where account = ${account}`);
    return Number([...r][0]?.s ?? 0);
  }
  async balances(account: Account, ids: string[]) {
    const m = new Map<string, number>(); if (!ids.length) return m;
    const r = await this.db.execute<{ o: string; s: string }>(sql`select owner_id::text o, sum(amount_centimes)::bigint s from money.ledger_entry where account = ${account} and owner_id = any(${ids}::uuid[]) group by owner_id`);
    for (const x of r) m.set(x.o, Number(x.s)); return m;
  }
  async totals() { return { platformRevenue: -(await this.balance("platform_revenue")), cashHeld: await this.balance("provider_cash_held"), earnings: -(await this.balance("provider_earnings")) }; }
}
