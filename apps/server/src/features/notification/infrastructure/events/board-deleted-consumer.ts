import { UnreadableEventError } from "../../../../shared/infrastructure/outbox/outbox-worker";
import type { EventConsumer } from "../../../../shared/infrastructure/outbox/outbox-worker";
import type { DropBoardNotifications } from "../../application/usecases/drop-board-notifications";
import { boardDeletedSchema } from "./board-deleted-schema";

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
