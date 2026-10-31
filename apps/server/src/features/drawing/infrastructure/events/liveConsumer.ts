import { z } from "zod";

import type { IPubSub } from "../../../../shared/application/interfaces/IPubSub";
import { UnreadableEventError } from "../../../../shared/infrastructure/outbox/OutboxWorker";
import type { EventConsumer } from "../../../../shared/infrastructure/outbox/OutboxWorker";
import { recheckBoardPeers } from "../crdt/YjsBoardHub";

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
export const createLiveConsumer =
  ({ pubsub }: { pubsub: IPubSub }): EventConsumer =>
  async (_id, payload) => {
    const event = accessEventSchema.safeParse(payload);
    if (!event.success) {
      throw new UnreadableEventError(event.error.message);
    }
    await recheckBoardPeers(pubsub, event.data.boardId);
  };
