import type { UserRef } from "../../../../shared/application/interfaces/IProfiles";
import { threadIdOf } from "../../domain/entities/Comment";
import type {
  CommentView,
  ReactionSummary,
} from "../ports/IBoardCommentRepository";

export interface CommentDto {
  id: string;
  boardId: string;
  pageId: string;
  x: number;
  y: number;
  body: string;
  author: UserRef;
  parentId: string | null;
  threadId: string;
  createdAt: string;
  editedAt: string | null;
  resolvedAt: string | null;
  resolvedBy: UserRef | null;
  assignee: UserRef | null;
  replyCount: number;
  reactions: ReactionSummary[];
}

export interface Paged<T> {
  items: T[];
  nextCursor: string | null;
}

/** Every user a comment page refers to, so one lookup serves the whole page. */
export const referencedUserIds = (views: CommentView[]) => [
  ...new Set(
    views.flatMap(({ comment }) =>
      [comment.authorId, comment.assigneeId, comment.resolvedById].filter(
        (id): id is string => id !== null
      )
    )
  ),
];

export const toCommentDto = (
  { comment, replyCount, reactions }: CommentView,
  people: Map<string, UserRef>
): CommentDto => {
  const ref = (id: string): UserRef =>
    people.get(id) ?? {
      id,
      name: "Deleted user",
      username: null,
      avatarUrl: null,
    };
  return {
    id: comment.id,
    boardId: comment.boardId,
    pageId: comment.pageId,
    x: comment.x,
    y: comment.y,
    body: comment.body,
    author: ref(comment.authorId),
    parentId: comment.parentId,
    threadId: threadIdOf(comment),
    createdAt: comment.createdAt.toISOString(),
    editedAt: comment.editedAt?.toISOString() ?? null,
    resolvedAt: comment.resolvedAt?.toISOString() ?? null,
    resolvedBy: comment.resolvedById ? ref(comment.resolvedById) : null,
    assignee: comment.assigneeId ? ref(comment.assigneeId) : null,
    replyCount,
    reactions,
  };
};
