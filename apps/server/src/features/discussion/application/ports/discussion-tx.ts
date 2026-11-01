import type { IOutbox } from "../../../../shared/application/interfaces/i-outbox";
import type { IProfileReader } from "../../../../shared/application/interfaces/i-profiles";
import type { IBoardMembers } from "./i-board-access";
import type { ICommentRepository } from "./i-comment-repository";

/** Repositories bound to one discussion transaction; writes through them commit or roll back together. */
export interface DiscussionTx {
  comments: ICommentRepository;
  members: IBoardMembers;
  outbox: IOutbox;
  profiles: IProfileReader;
}
