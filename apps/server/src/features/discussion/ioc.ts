import type { Database, DbExecutor } from "@narbel/db";
import { Elysia } from "elysia";

import { UuidGenerator } from "../../shared/infrastructure/ids/uuid-generator";
import { DrizzleOutbox } from "../../shared/infrastructure/outbox/drizzle-outbox";
import { DrizzleProcessedEvents } from "../../shared/infrastructure/outbox/drizzle-processed-events";
import { wakeWhenQueued } from "../../shared/infrastructure/outbox/waking-outbox";
import { DrizzleUnitOfWork } from "../../shared/infrastructure/uow/drizzle-unit-of-work";
import type { BetterAuthPlugin } from "../auth";
import { DrizzleProfileRepository } from "../profile";
import { CommentActivityFeed } from "./application/comment-activity-feed";
import type { DiscussionTx } from "./application/ports/discussion-tx";
import type {
  IBoardAccess,
  IBoardMembers,
} from "./application/ports/i-board-access";
import { AddComment } from "./application/usecases/add-comment";
import { AssignComment } from "./application/usecases/assign-comment";
import { DeleteComment } from "./application/usecases/delete-comment";
import { EditComment } from "./application/usecases/edit-comment";
import { ListComments } from "./application/usecases/list-comments";
import { ListReplies } from "./application/usecases/list-replies";
import { ReplyToComment } from "./application/usecases/reply-to-comment";
import { ResolveComment } from "./application/usecases/resolve-comment";
import { SetCommentReaction } from "./application/usecases/set-comment-reaction";
import { UnassignRemovedMember } from "./application/usecases/unassign-removed-member";
import type { UnassignTx } from "./application/usecases/unassign-removed-member";
import { MemberRemovedConsumer } from "./infrastructure/events/member-removed-consumer";
import { DrizzleCommentRepository } from "./infrastructure/repositories/drizzle-comment-repository";
import { createBoardCommentController } from "./presentation/http/comment-controller";

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
    const outbox = wakeWhenQueued(
      new DrizzleOutbox(tx, ids),
      afterCommit,
      wakeOutbox
    );
    return {
      comments: new DrizzleCommentRepository(tx),
      members: membersIn(tx),
      outbox,
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

export const createDiscussionModule = (
  betterAuth: BetterAuthPlugin,
  uc: CommentUseCases
) =>
  new Elysia({ name: "feature/discussion" }).use(
    createBoardCommentController(betterAuth, uc)
  );

/** Wires the member-removed consumer: the unassign commits with its processed mark. */
export const createDiscussionConsumer = ({ db }: { db: Database }) =>
  new MemberRemovedConsumer(
    new UnassignRemovedMember(
      new DrizzleUnitOfWork<UnassignTx>(db, (tx) => ({
        comments: new DrizzleCommentRepository(tx),
        processed: new DrizzleProcessedEvents(tx),
      }))
    )
  );
