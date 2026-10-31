import { and, eq, sql } from "@narbel/db";
import type { DbExecutor } from "@narbel/db";
import { outbox } from "@narbel/db/schema/account";

import type { IIdGenerator } from "../../application/interfaces/IIdGenerator";
import type {
  IOutbox,
  OutboxEvent,
  OutboxMessage,
} from "../../application/interfaces/IOutbox";

export class DrizzleOutbox implements IOutbox {
  constructor(
    private readonly db: DbExecutor,
    private readonly ids: IIdGenerator
  ) {}

  async enqueue(message: OutboxMessage, dedupeKey: string) {
    await this.db
      .insert(outbox)
      .values({
        id: this.ids.generate(),
        type: message.type,
        payload: message,
        // the worker compares this with the application clock; a database default would mix two clocks
        nextAttemptAt: new Date(),
        dedupeKey,
      })
      .onConflictDoNothing({ target: outbox.dedupeKey });
  }

  async publish(event: OutboxEvent) {
    await this.db.insert(outbox).values({
      id: this.ids.generate(),
      type: event.type,
      payload: { ...event },
      nextAttemptAt: new Date(),
    });
  }

  async forget(dedupeKey: string) {
    await this.db.delete(outbox).where(eq(outbox.dedupeKey, dedupeKey));
  }

  async forgetPendingTo(email: string) {
    await this.db
      .delete(outbox)
      .where(
        and(
          eq(outbox.status, "pending"),
          sql`${outbox.payload}->>'to' = ${email}`
        )
      );
  }
}
