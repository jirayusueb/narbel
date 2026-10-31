import type { BoardsEvent } from "../../../../shared/application/events/BoardsEvent";
import type { IUnitOfWork } from "../../../../shared/application/interfaces/IUnitOfWork";
import { NOTIFICATION_CONSUMER } from "./HandleDiscussionEvent";
import type { NotificationTx } from "./HandleDiscussionEvent";

/**
 * Turns an invitation into the invitee's inbox entry and the invite email, once per event id. The
 * email's dedupe key keeps a re-invite from mailing again; `firstInvite` keeps it from notifying again.
 */
export class HandleMemberInvited {
  constructor(private readonly uow: IUnitOfWork<NotificationTx>) {}

  async execute(
    eventId: string,
    event: Extract<BoardsEvent, { type: "event.member-invited" }>
  ): Promise<void> {
    await this.uow.run(async (tx) => {
      if (!(await tx.processed.claim(NOTIFICATION_CONSUMER, eventId))) {
        return;
      }
      if (event.inviteeId && event.firstInvite) {
        const people = await tx.people.findPeople([
          event.inviteeId,
          event.inviterId,
        ]);
        // an invitee deleted since the invite has no inbox to fill; a deleted inviter still shows by the name sent
        if (people.some((person) => person.id === event.inviteeId)) {
          const inviter = people.find(
            (person) => person.id === event.inviterId
          );
          await tx.notifications.add(event.inviteeId, {
            kind: "board.invited",
            boardId: event.boardId,
            boardTitle: event.boardTitle,
            actor: {
              userId: event.inviterId,
              username: inviter?.username ?? null,
              name: event.inviterName,
            },
          });
        }
      }
      await tx.outbox.enqueue(
        {
          type: "email.board-invite",
          to: event.email,
          boardId: event.boardId,
          boardTitle: event.boardTitle,
          inviterName: event.inviterName,
        },
        `invite:${event.boardId}:${event.email}`
      );
    });
  }
}
