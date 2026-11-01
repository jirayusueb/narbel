import { UnreadableEventError } from "../../../../shared/infrastructure/outbox/OutboxWorker";
import type { EventConsumer } from "../../../../shared/infrastructure/outbox/OutboxWorker";
import type { HandleDiscussionEvent } from "../../application/usecases/HandleDiscussionEvent";
import { discussionEventSchema } from "./discussionEventSchema";

export class DiscussionEventConsumer {
  constructor(private readonly handler: HandleDiscussionEvent) {}

  readonly consume: EventConsumer = async (id, payload) => {
    const event = discussionEventSchema.safeParse(payload);
    if (!event.success) {
      throw new UnreadableEventError(event.error.message);
    }
    await this.handler.execute(id, event.data);
  };
}
