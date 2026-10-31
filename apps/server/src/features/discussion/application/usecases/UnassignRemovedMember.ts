import type { BoardsEvent } from "../../../../shared/application/events/BoardsEvent";
import type { IProcessedEvents } from "../../../../shared/application/interfaces/IProcessedEvents";
import type { IUnitOfWork } from "../../../../shared/application/interfaces/IUnitOfWork";
import type { IBoardCommentRepository } from "../ports/ICommentRepository";

export const DISCUSSION_CONSUMER = "discussion";

export interface UnassignTx {
  comments: IBoardCommentRepository;
  processed: IProcessedEvents;
}

/** Someone without access cannot own work on the board: a removed member stops being an assignee, once per event. */
export class UnassignRemovedMember {
  constructor(private readonly uow: IUnitOfWork<UnassignTx>) {}

  async execute(
    eventId: string,
    event: Extract<BoardsEvent, { type: "event.member-removed" }>
  ): Promise<void> {
    const { personId } = event;
    // an invite nobody claimed was never assigned anything
    if (!personId) {
      return;
    }
    await this.uow.run(async (tx) => {
      if (await tx.processed.claim(DISCUSSION_CONSUMER, eventId)) {
        await tx.comments.clearAssignee(event.boardId, personId);
      }
    });
  }
}
