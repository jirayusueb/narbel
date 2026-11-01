import { UnreadableEventError } from "../../../../shared/infrastructure/outbox/outbox-worker";
import type { EventConsumer } from "../../../../shared/infrastructure/outbox/outbox-worker";
import type { IndexComment } from "../../application/usecases/index-comment";
import { commentChangeSchema } from "./comment-change-schema";
import { unlessBoardGone } from "./unless-board-gone";

/** Reads discussion's comment changes off the outbox: the mirror rows and the processed mark commit together. */
export class CommentChangeConsumer {
  constructor(private readonly indexComment: IndexComment) {}

  readonly consume: EventConsumer = async (id, payload) => {
    const event = commentChangeSchema.safeParse(payload);
    if (!event.success) {
      throw new UnreadableEventError(event.error.message);
    }
    await unlessBoardGone(this.indexComment.execute(id, event.data));
  };
}
