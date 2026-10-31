import type { IUnitOfWork } from "../../../../shared/application/interfaces/IUnitOfWork";
import { inSequence } from "../../../../shared/kernel/inSequence";
import { commentsDeleted } from "../DiscussionEvents";
import type { DiscussionTx } from "../ports/DiscussionTx";

export type EraseTx = Pick<DiscussionTx, "comments" | "outbox">;

/**
 * Decision 4: a deleted person's comments, and the replies under their threads, go before the
 * person does, with one delete event per page, so mirrors of comment text (search) drop them too.
 */
export class EraseAuthorComments {
  constructor(private readonly uow: IUnitOfWork<EraseTx>) {}

  async execute(personId: string): Promise<void> {
    await this.uow.run(async (tx) => {
      const removed = await tx.comments.deleteByAuthor(personId);
      const pages = new Map<
        string,
        { boardId: string; pageId: string; ids: string[] }
      >();
      for (const { id, boardId, pageId } of removed) {
        const key = `${boardId}\u0000${pageId}`;
        const page = pages.get(key) ?? { boardId, pageId, ids: [] };
        page.ids.push(id);
        pages.set(key, page);
      }
      const at = new Date();
      await inSequence([...pages.values()], (page) =>
        tx.outbox.publish(commentsDeleted(page, page.ids, at))
      );
    });
  }
}
