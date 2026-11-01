import { UnreadableEventError } from "../../../../shared/infrastructure/outbox/outbox-worker";
import type { EventConsumer } from "../../../../shared/infrastructure/outbox/outbox-worker";
import type { HandleDiscussionEvent } from "../../application/usecases/handle-discussion-event";
import { discussionEventSchema } from "./discussion-event-schema";

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
