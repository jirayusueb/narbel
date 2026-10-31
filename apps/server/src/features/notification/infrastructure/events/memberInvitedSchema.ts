import { z } from "zod";

import type { BoardsEvent } from "../../../../shared/application/events/BoardsEvent";

/** The boards event notification reads, validated where it enters: a payload it cannot read is dead. */
export const memberInvitedSchema: z.ZodType<
  Extract<BoardsEvent, { type: "event.member-invited" }>
> = z.object({
  type: z.literal("event.member-invited"),
  version: z.literal(1),
  boardId: z.string(),
  boardTitle: z.string(),
  email: z.string(),
  inviteeId: z.string().nullable(),
  inviterId: z.string(),
  inviterName: z.string(),
  firstInvite: z.boolean(),
});
