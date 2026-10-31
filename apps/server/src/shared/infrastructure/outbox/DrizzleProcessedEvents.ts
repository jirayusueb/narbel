import type { DbExecutor } from "@narbel/db";
import { processedEvent } from "@narbel/db/schema/account";

import type { IProcessedEvents } from "../../application/interfaces/IProcessedEvents";

export class DrizzleProcessedEvents implements IProcessedEvents {
  constructor(private readonly db: DbExecutor) {}

  async claim(consumer: string, eventId: string) {
    const inserted = await this.db
      .insert(processedEvent)
      .values({ consumer, eventId })
      .onConflictDoNothing()
      .returning({ eventId: processedEvent.eventId });
    return inserted.length > 0;
  }
}
