import { z } from "zod";

import type { Email } from "../../application/interfaces/IEmailSender";
import type {
  OutboxMessage,
  OutboxMessageType,
} from "../../application/interfaces/IOutbox";
import { buildCommentEmail, buildInviteEmail } from "./emails";

export interface RenderContext {
  webOrigin: string;
}

interface Entry<M extends OutboxMessage> {
  schema: z.ZodType<M>;
  render(message: M, context: RenderContext): Email;
}

type Registry = {
  [K in OutboxMessageType]: Entry<Extract<OutboxMessage, { type: K }>>;
};

const commentLink = (
  { webOrigin }: RenderContext,
  boardId: string,
  commentId: string
) => `${webOrigin}/boards/${boardId}?comment=${commentId}`;

const commentFields = {
  to: z.string(),
  boardId: z.string(),
  commentId: z.string(),
  actorName: z.string(),
  excerpt: z.string(),
};

/** One entry per message type: how its payload is validated and how it becomes an email. */
export const outboxRegistry: Registry = {
  "email.board-invite": {
    schema: z.object({
      type: z.literal("email.board-invite"),
      to: z.string(),
      boardId: z.string(),
      boardTitle: z.string(),
      inviterName: z.string(),
    }),
    render: (m, { webOrigin }) => ({
      to: m.to,
      ...buildInviteEmail({
        boardTitle: m.boardTitle,
        inviterName: m.inviterName,
        link: `${webOrigin}/boards/${m.boardId}`,
      }),
    }),
  },
  "email.comment-assigned": {
    schema: z.object({
      type: z.literal("email.comment-assigned"),
      ...commentFields,
    }),
    render: (m, context) => ({
      to: m.to,
      ...buildCommentEmail({
        subject: `${m.actorName} assigned you a Narbel comment`,
        headline: "assigned you a comment",
        actorName: m.actorName,
        excerpt: m.excerpt,
        link: commentLink(context, m.boardId, m.commentId),
      }),
    }),
  },
  "email.mentioned": {
    schema: z.object({
      type: z.literal("email.mentioned"),
      ...commentFields,
    }),
    render: (m, context) => ({
      to: m.to,
      ...buildCommentEmail({
        subject: `${m.actorName} mentioned you in Narbel`,
        headline: "mentioned you in a comment",
        actorName: m.actorName,
        excerpt: m.excerpt,
        link: commentLink(context, m.boardId, m.commentId),
      }),
    }),
  },
};

/** Validates a stored payload and renders it; throws on an unknown type or a payload that no longer fits. */
export const renderOutboxMessage = (
  type: string,
  payload: unknown,
  context: RenderContext
): Email => {
  if (!Object.hasOwn(outboxRegistry, type)) {
    throw new Error(`Unknown outbox message type "${type}"`);
  }
  const entry = outboxRegistry[
    type as OutboxMessageType
  ] as Entry<OutboxMessage>;
  return entry.render(entry.schema.parse(payload), context);
};
