import { UnreadableEventError } from "../../../../shared/infrastructure/outbox/OutboxWorker";
import type { EventConsumer } from "../../../../shared/infrastructure/outbox/OutboxWorker";
import type { IndexDrawingText } from "../../application/usecases/IndexDrawingText";
import { drawingTextChangedSchema } from "./drawingTextChangedSchema";
import { unlessBoardGone } from "./unlessBoardGone";

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
