import { and, eq, lte } from "@narbel/db";
import type { Database } from "@narbel/db";
import { outbox } from "@narbel/db/schema/account";

import type { ClaimedMessage, IOutboxStore } from "./OutboxStore";

export class DrizzleOutboxStore implements IOutboxStore {
  constructor(private readonly db: Database) {}

  claimDue(
    now: Date,
    limit: number,
    leaseUntil: (attemptsBefore: number) => Date
  ): Promise<ClaimedMessage[]> {
    return this.db.transaction(async (tx) => {
      const due = await tx
        .select()
        .from(outbox)
        .where(
          and(eq(outbox.status, "pending"), lte(outbox.nextAttemptAt, now))
        )
        .orderBy(outbox.nextAttemptAt)
        .limit(limit)
        .for("update", { skipLocked: true });
      await Promise.all(
        due.map((row) =>
          tx
            .update(outbox)
            .set({
              attempts: row.attempts + 1,
              nextAttemptAt: leaseUntil(row.attempts),
            })
            .where(eq(outbox.id, row.id))
        )
      );
      return due.map((row) => ({
        id: row.id,
        type: row.type,
        payload: row.payload,
        attempts: row.attempts + 1,
      }));
    });
  }

  async markSent(id: string, at: Date) {
    await this.db
      .update(outbox)
      // the payload holds the recipient and an excerpt; once delivered only type and timestamps stay
      .set({ status: "sent", sentAt: at, lastError: null, payload: {} })
      .where(and(eq(outbox.id, id), eq(outbox.status, "pending")));
  }

  async markFailed(id: string, error: string, dead: boolean, retryAt: Date) {
    await this.db
      .update(outbox)
      // the lease covered a whole slow batch; the retry waits only its backoff from the actual failure
      .set({
        lastError: error,
        nextAttemptAt: retryAt,
        ...(dead ? { status: "dead" as const } : {}),
      })
      .where(and(eq(outbox.id, id), eq(outbox.status, "pending")));
  }
}
