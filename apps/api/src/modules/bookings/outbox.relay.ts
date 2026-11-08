import { isNull, asc, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as s from "../../db/schema";

export interface Publisher { publish(type: string, eventId: string, payload: unknown): Promise<void> }

/** Relays unpublished outbox rows to the bus (NATS in production). At-least-once; consumers dedupe on eventId. */
export async function relayOutbox(db: PostgresJsDatabase, pub: Publisher, batch = 100): Promise<number> {
  return db.transaction(async (tx) => {
    const rows = await tx.select().from(s.outbox).where(isNull(s.outbox.publishedAt)).orderBy(asc(s.outbox.id)).limit(batch).for("update", { skipLocked: true });
    for (const r of rows) {
      await pub.publish(r.type, r.eventId, r.payload);
      await tx.update(s.outbox).set({ publishedAt: new Date() }).where(eq(s.outbox.id, r.id));
    }
    return rows.length;
  });
}
