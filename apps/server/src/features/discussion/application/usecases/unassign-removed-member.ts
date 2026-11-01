import type { BoardsEvent } from "../../../../shared/application/events/boards-event";
import type { IProcessedEvents } from "../../../../shared/application/interfaces/i-processed-events";
import type { IUnitOfWork } from "../../../../shared/application/interfaces/i-unit-of-work";
import type { ICommentRepository } from "../ports/i-comment-repository";

export const DISCUSSION_CONSUMER = "discussion";

export interface UnassignTx {
  comments: ICommentRepository;
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
