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
      type: "event.access-changed";
      version: 1;
      boardId: string;
    };
