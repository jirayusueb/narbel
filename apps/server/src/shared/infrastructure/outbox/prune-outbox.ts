import { and, eq, lt, or } from "@narbel/db";
import type { Database } from "@narbel/db";
import { outbox, processedEvent } from "@narbel/db/schema/account";

export const OUTBOX_RETENTION_MS = 30 * 24 * 3_600_000;

/**
 * Deletes finished outbox rows and consumers' processed marks past retention. Age only, so a
 * rerun after a crash converges. A dead row's last change is its last attempt time.
 */
export const pruneOutbox = async (db: Database, now: Date) => {
  const cutoff = new Date(now.getTime() - OUTBOX_RETENTION_MS);
  await db
    .delete(outbox)
    .where(
      or(
        and(eq(outbox.status, "sent"), lt(outbox.sentAt, cutoff)),
        and(eq(outbox.status, "dead"), lt(outbox.nextAttemptAt, cutoff))
      )
    );
  await db.delete(processedEvent).where(lt(processedEvent.handledAt, cutoff));
};
