import { z } from "zod";

import type { CommentChangeEvent } from "../../../../shared/application/events/DiscussionEvent";

const change = {
  version: z.literal(1),
  boardId: z.string(),
  pageId: z.string(),
  at: z.iso.datetime(),
};

/** The discussion events search reads, validated where they enter: a payload it cannot read is dead. */
export const commentChangeSchema: z.ZodType<CommentChangeEvent> =
  z.discriminatedUnion("type", [
    z.object({
      type: z.enum(["event.comment-posted", "event.comment-edited"]),
      ...change,
      commentId: z.string(),
      body: z.string(),
    }),
    z.object({
      type: z.literal("event.comment-deleted"),
      ...change,
      commentIds: z.array(z.string()),
    }),
  ]);
