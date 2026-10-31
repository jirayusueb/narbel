import type { Database, DbExecutor } from "@narbel/db";
import { Elysia } from "elysia";

import { UuidGenerator } from "../../shared/infrastructure/ids/UuidGenerator";
import { DrizzleOutbox } from "../../shared/infrastructure/outbox/DrizzleOutbox";
import { DrizzleProcessedEvents } from "../../shared/infrastructure/outbox/DrizzleProcessedEvents";
import { UnreadableEventError } from "../../shared/infrastructure/outbox/OutboxWorker";
import type { EventConsumer } from "../../shared/infrastructure/outbox/OutboxWorker";
import { DrizzleUnitOfWork } from "../../shared/infrastructure/uow/DrizzleUnitOfWork";
import type { BetterAuthPlugin } from "../auth";
import { DrizzleProfileRepository } from "../profile";
import { CommentActivityFeed } from "./application/CommentActivityFeed";
import type { DiscussionTx } from "./application/ports/DiscussionTx";
import type {
  IBoardAccess,
  IBoardMembers,
} from "./application/ports/IBoardAccess";
import { AddComment } from "./application/usecases/AddComment";
import { AssignComment } from "./application/usecases/AssignComment";
import { DeleteComment } from "./application/usecases/DeleteComment";
import { EditComment } from "./application/usecases/EditComment";
import { EraseAuthorComments } from "./application/usecases/EraseAuthorComments";
import type { EraseTx } from "./application/usecases/EraseAuthorComments";
import { ListComments } from "./application/usecases/ListComments";
import { ListReplies } from "./application/usecases/ListReplies";
import { ReplyToComment } from "./application/usecases/ReplyToComment";
import { ResolveComment } from "./application/usecases/ResolveComment";
import { SetCommentReaction } from "./application/usecases/SetCommentReaction";
import { UnassignRemovedMember } from "./application/usecases/UnassignRemovedMember";
import type { UnassignTx } from "./application/usecases/UnassignRemovedMember";
import { memberRemovedSchema } from "./infrastructure/events/memberRemovedSchema";
import { DrizzleCommentRepository } from "./infrastructure/repositories/DrizzleCommentRepository";
import { createBoardCommentController } from "./presentation/http/CommentController";

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

export interface DiscussionDeps {
  db: Database;
  /** where browsers reach this API; avatar urls point here */
  apiOrigin: string;
  /** asks the outbox worker for a pass now; comment events wake it after they commit */
  wakeOutbox: () => void;
  /** boards' AccessPolicy */
  access: IBoardAccess;
  /** boards' members of a board, read inside a comment's transaction */
  membersIn: (tx: DbExecutor) => IBoardMembers;
}

export const createCommentUseCases = ({
  db,
  apiOrigin,
  wakeOutbox,
  access,
  membersIn,
}: DiscussionDeps): CommentUseCases => {
  const comments = new DrizzleCommentRepository(db);
  const profiles = new DrizzleProfileRepository(db, apiOrigin);
  const ids = new UuidGenerator();
  // comment use cases commit with their own aggregate set: the comment, its outbox events, member and profile reads
  const uow = new DrizzleUnitOfWork<DiscussionTx>(db, (tx, afterCommit) => {
    afterCommit(wakeOutbox);
    return {
      comments: new DrizzleCommentRepository(tx),
      members: membersIn(tx),
      outbox: new DrizzleOutbox(tx, ids),
      profiles: new DrizzleProfileRepository(tx, apiOrigin),
    };
  });
  return {
    addComment: new AddComment(access, uow, ids),
    assignComment: new AssignComment(access, uow),
    deleteComment: new DeleteComment(access, uow),
    editComment: new EditComment(access, uow),
    listComments: new ListComments(access, comments, profiles),
    listReplies: new ListReplies(access, comments, profiles),
    replyToComment: new ReplyToComment(access, uow, ids),
    resolveComment: new ResolveComment(access, uow),
    setCommentReaction: new SetCommentReaction(access, comments, profiles),
  };
};

/** Comment activity on a board after a cursor, as drawing's get_changes reports it. */
export const createCommentActivity = ({
  db,
  apiOrigin,
}: Pick<DiscussionDeps, "db" | "apiOrigin">) =>
  new CommentActivityFeed(
    new DrizzleCommentRepository(db),
    new DrizzleProfileRepository(db, apiOrigin)
  );

/** Decision 4, run while the person still exists: their comments go with a delete event each page. */
export const createAuthorErasure = ({ db }: { db: Database }) => {
  const erase = new EraseAuthorComments(
    new DrizzleUnitOfWork<EraseTx>(db, (tx) => ({
      comments: new DrizzleCommentRepository(tx),
      outbox: new DrizzleOutbox(tx, new UuidGenerator()),
    }))
  );
  return (personId: string) => erase.execute(personId);
};

export const createDiscussionModule = (
  betterAuth: BetterAuthPlugin,
  uc: CommentUseCases
) =>
  new Elysia({ name: "feature/discussion" }).use(
    createBoardCommentController(betterAuth, uc)
  );

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
