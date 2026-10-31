/**
 * The integration events boards publishes through the outbox: its published language. The
 * producer builds them, consumers read them; neither imports the other.
 */
export type BoardsEvent =
  | {
      type: "event.member-removed";
      /** a payload change that removes or renames a field needs a new version */
      version: 1;
      boardId: string;
      /** the email the grant was held under */
      email: string;
      /** null while the invited email had not signed in yet */
      personId: string | null;
    }
  | {
      type: "event.member-invited";
      version: 1;
      boardId: string;
      boardTitle: string;
      /** normalized: the address the invitation went to */
      email: string;
      /** null while the invited email has no account */
      inviteeId: string | null;
      inviterId: string;
      inviterName: string;
      /** false when the email already held a grant, as in a role change */
      firstInvite: boolean;
    }
  | {
      type: "event.access-changed";
      version: 1;
      boardId: string;
    }
  | {
      type: "event.board-deleted";
      version: 1;
      boardId: string;
      ownerId: string;
    };
