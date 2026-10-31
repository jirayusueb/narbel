import { z } from "zod";

import type { BoardsEvent } from "../../../../shared/application/events/BoardsEvent";

/** The boards event notification reads, validated where it enters: a payload it cannot read is dead. */
export const memberRemovedSchema: z.ZodType<
  Extract<BoardsEvent, { type: "event.member-removed" }>
> = z.object({
  type: z.literal("event.member-removed"),
  version: z.literal(1),
  boardId: z.string(),
  email: z.string(),
  personId: z.string().nullable(),
});
