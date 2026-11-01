import { UnreadableEventError } from "../../../../shared/infrastructure/outbox/OutboxWorker";
import type { EventConsumer } from "../../../../shared/infrastructure/outbox/OutboxWorker";
import type { DropBoardNotifications } from "../../application/usecases/DropBoardNotifications";
import { boardDeletedSchema } from "./boardDeletedSchema";

export class BoardDeletedConsumer {
  constructor(private readonly handler: DropBoardNotifications) {}

  readonly consume: EventConsumer = async (id, payload) => {
    const event = boardDeletedSchema.safeParse(payload);
    if (!event.success) {
      throw new UnreadableEventError(event.error.message);
    }
    await this.handler.execute(id, event.data);
  };
}
