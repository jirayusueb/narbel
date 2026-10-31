import type { Database } from "@narbel/db";

import { DrizzleProcessedEvents } from "../../shared/infrastructure/outbox/DrizzleProcessedEvents";
import { UnreadableEventError } from "../../shared/infrastructure/outbox/OutboxWorker";
import type { EventConsumer } from "../../shared/infrastructure/outbox/OutboxWorker";
import { DrizzleUnitOfWork } from "../../shared/infrastructure/uow/DrizzleUnitOfWork";
import type { AddComment } from "./application/usecases/AddComment";
import type { AssignComment } from "./application/usecases/AssignComment";
import type { DeleteComment } from "./application/usecases/DeleteComment";
import type { EditComment } from "./application/usecases/EditComment";
import type { ListComments } from "./application/usecases/ListComments";
import type { ListReplies } from "./application/usecases/ListReplies";
import type { ReplyToComment } from "./application/usecases/ReplyToComment";
import type { ResolveComment } from "./application/usecases/ResolveComment";
import type { SetCommentReaction } from "./application/usecases/SetCommentReaction";
import { UnassignRemovedMember } from "./application/usecases/UnassignRemovedMember";
import type { UnassignTx } from "./application/usecases/UnassignRemovedMember";
import { memberRemovedSchema } from "./infrastructure/events/memberRemovedSchema";
import { DrizzleCommentRepository } from "./infrastructure/repositories/DrizzleCommentRepository";

/** The comment use cases the transport drives. */
export interface CommentUseCases {
  addComment: AddComment;
  assignComment: AssignComment;
  deleteComment: DeleteComment;
  editComment: EditComment;
  listComments: ListComments;
  listReplies: ListReplies;
  replyToComment: ReplyToComment;
  resolveComment: ResolveComment;
  setCommentReaction: SetCommentReaction;
}

/** Reads boards' member-removed off the outbox: the unassign and the processed mark commit together. */
export const createDiscussionConsumer = ({
  db,
}: {
  db: Database;
}): EventConsumer => {
  const unassign = new UnassignRemovedMember(
    new DrizzleUnitOfWork<UnassignTx>(db, (tx) => ({
      comments: new DrizzleCommentRepository(tx),
      processed: new DrizzleProcessedEvents(tx),
    }))
  );
  return async (id, payload) => {
    const event = memberRemovedSchema.safeParse(payload);
    if (!event.success) {
      throw new UnreadableEventError(event.error.message);
    }
    await unassign.execute(id, event.data);
  };
};
