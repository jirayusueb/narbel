import type { CommentChangeEvent } from "../../../../shared/application/events/DiscussionEvent";
import type { IUnitOfWork } from "../../../../shared/application/interfaces/IUnitOfWork";
import { SEARCH_CONSUMER } from "../ports/SearchTx";
import type { SearchTx } from "../ports/SearchTx";

/** Mirrors a comment change from discussion, once per event; the index keeps the newest change and every delete. */
export class IndexComment {
  constructor(private readonly uow: IUnitOfWork<SearchTx>) {}

  async execute(eventId: string, event: CommentChangeEvent): Promise<void> {
    await this.uow.run(async (tx) => {
      if (!(await tx.processed.claim(SEARCH_CONSUMER, eventId))) {
        return;
      }
      const at = new Date(event.at);
      if (event.type === "event.comment-deleted") {
        await tx.comments.remove(event, event.commentIds, at);
      } else if (event.type === "event.comment-posted") {
        await tx.comments.post(event, at);
      } else {
        await tx.comments.edit(event, at);
      }
    });
  }
}
