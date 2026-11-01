import { z } from "zod";

import type { IPubSub } from "../../../../shared/application/interfaces/i-pub-sub";
import { UnreadableEventError } from "../../../../shared/infrastructure/outbox/outbox-worker";
import type { EventConsumer } from "../../../../shared/infrastructure/outbox/outbox-worker";
import { recheckBoardPeers } from "../crdt/yjs-board-hub";

/** The boards events drawing.live reads, validated where they enter; it needs only which board changed. */
const accessEventSchema = z.object({
  type: z.enum(["event.member-removed", "event.access-changed"]),
  version: z.literal(1),
  boardId: z.string(),
});

/**
 * drawing.live (decision 1): a removed member or changed access re-decides every open peer of the
 * board on every instance. A recheck is idempotent, so a repeated delivery needs no processed mark,
 * and a bus failure throws so the event is retried.
 */
export class LiveConsumer {
  constructor(private readonly pubsub: IPubSub) {}

  readonly consume: EventConsumer = async (_id, payload) => {
    const event = accessEventSchema.safeParse(payload);
    if (!event.success) {
      throw new UnreadableEventError(event.error.message);
    }
    await recheckBoardPeers(this.pubsub, event.data.boardId);
  };
}
