import { z } from "zod";

import type { BoardsEvent } from "../../../../shared/application/events/BoardsEvent";

/** The boards event drawing reads, validated where it enters: a payload it cannot read is dead. */
export const boardDeletedSchema: z.ZodType<
  Extract<BoardsEvent, { type: "event.board-deleted" }>
> = z.object({
  type: z.literal("event.board-deleted"),
  version: z.literal(1),
  boardId: z.string(),
  ownerId: z.string(),
});
