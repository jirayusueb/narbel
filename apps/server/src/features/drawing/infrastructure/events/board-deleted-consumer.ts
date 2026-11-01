import { UnreadableEventError } from "../../../../shared/infrastructure/outbox/outbox-worker";
import type { EventConsumer } from "../../../../shared/infrastructure/outbox/outbox-worker";
import type { DeleteDrawing } from "../../application/usecases/delete-drawing";
import { boardDeletedSchema } from "./board-deleted-schema";

/**
 * Reads boards' board-deleted off the outbox: drops the board's drawing rows, its live room and its
 * stored files, once per event.
 */
export class BoardDeletedConsumer {
  constructor(private readonly deleteDrawing: DeleteDrawing) {}

  readonly consume: EventConsumer = async (id, payload) => {
    const event = boardDeletedSchema.safeParse(payload);
    if (!event.success) {
      throw new UnreadableEventError(event.error.message);
    }
    await this.deleteDrawing.execute(id, event.data);
  };
}
