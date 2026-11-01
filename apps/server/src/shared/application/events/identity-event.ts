/**
 * The integration events identity publishes through the outbox: its published language. The
 * producer builds them, consumers read them; neither imports the other.
 */
export interface IdentityEvent {
  type: "event.person-deleted";
  /** a payload change that removes or renames a field needs a new version */
  version: 1;
  personId: string;
  /** the address the person's undelivered emails went to */
  email: string;
}
