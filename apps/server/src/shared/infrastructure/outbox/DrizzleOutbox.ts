import type { DbExecutor } from "@narbel/db";
import { outbox } from "@narbel/db/schema/account";

import type { IIdGenerator } from "../../application/interfaces/IIdGenerator";
import type {
  IOutbox,
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
}
