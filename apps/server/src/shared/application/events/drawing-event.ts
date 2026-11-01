/**
 * The integration events drawing publishes through the outbox: its published language. The
 * producer builds them, consumers read them; neither imports the other.
 */
export interface DrawingEvent {
  type: "event.drawing-text-changed";
  /** a payload change that removes or renames a field needs a new version */
  version: 1;
  boardId: string;
  /** ISO time of the save; a consumer applies a set only over an older one */
  savedAt: string;
  /** every searchable text of the board after the save, not a difference */
  texts: { pageId: string; elementId: string; text: string }[];
}
