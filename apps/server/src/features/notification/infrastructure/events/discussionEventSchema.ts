import { z } from "zod";

import type { DiscussionEvent } from "../../../../shared/application/events/DiscussionEvent";

const actor = z.object({
  userId: z.string(),
  username: z.string().nullable(),
  name: z.string(),
});

const base = {
  version: z.literal(1),
  boardId: z.string(),
  commentId: z.string(),
  threadId: z.string(),
  actor,
};

const recipient = z.object({ id: z.string(), email: z.string() });

/** The discussion events notification reads, validated where they enter: a payload it cannot read is dead. */
export const discussionEventSchema: z.ZodType<DiscussionEvent> =
  z.discriminatedUnion("type", [
    z.object({
      type: z.literal("event.comment-assigned"),
      ...base,
      excerpt: z.string(),
      recipient,
    }),
    z.object({
      type: z.literal("event.people-mentioned"),
      ...base,
      excerpt: z.string(),
      recipients: z.array(recipient),
    }),
    z.object({
      type: z.literal("event.thread-replied"),
      ...base,
      excerpt: z.string(),
      recipientIds: z.array(z.string()),
    }),
    z.object({
      type: z.literal("event.thread-resolved"),
      ...base,
      recipientIds: z.array(z.string()),
    }),
  ]);
