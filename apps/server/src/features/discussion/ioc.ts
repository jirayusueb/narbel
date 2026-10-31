import type { AddComment } from "./application/usecases/AddComment";
import type { AssignComment } from "./application/usecases/AssignComment";
import type { DeleteComment } from "./application/usecases/DeleteComment";
import type { EditComment } from "./application/usecases/EditComment";
import type { ListComments } from "./application/usecases/ListComments";
import type { ListReplies } from "./application/usecases/ListReplies";
import type { ReplyToComment } from "./application/usecases/ReplyToComment";
import type { ResolveComment } from "./application/usecases/ResolveComment";
import type { SetCommentReaction } from "./application/usecases/SetCommentReaction";

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
