import { z } from "zod";

import type { DrawingEvent } from "../../../../shared/application/events/DrawingEvent";

/** The drawing event search reads, validated where it enters: a payload it cannot read is dead. */
export const drawingTextChangedSchema: z.ZodType<DrawingEvent> = z.object({
  type: z.literal("event.drawing-text-changed"),
  version: z.literal(1),
  boardId: z.string(),
  savedAt: z.iso.datetime(),
  texts: z.array(
    z.object({ pageId: z.string(), elementId: z.string(), text: z.string() })
  ),
});
