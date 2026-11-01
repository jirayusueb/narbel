import { UnreadableEventError } from "../../../../shared/infrastructure/outbox/outbox-worker";
import type { EventConsumer } from "../../../../shared/infrastructure/outbox/outbox-worker";
import type { IndexDrawingText } from "../../application/usecases/index-drawing-text";
import { drawingTextChangedSchema } from "./drawing-text-changed-schema";
import { unlessBoardGone } from "./unless-board-gone";

/** Reads drawing's text changes off the outbox: the mirror rows and the processed mark commit together. */
export class DrawingTextConsumer {
  constructor(private readonly indexText: IndexDrawingText) {}

  readonly consume: EventConsumer = async (id, payload) => {
    const event = drawingTextChangedSchema.safeParse(payload);
    if (!event.success) {
      throw new UnreadableEventError(event.error.message);
    }
    await unlessBoardGone(this.indexText.execute(id, event.data));
  };
}
