import type { IOutbox } from "../../../../shared/application/interfaces/IOutbox";
import type { IProfileReader } from "../../../../shared/application/interfaces/IProfiles";
import type { IBoardMembers } from "./IBoardAccess";
import type { IBoardCommentRepository } from "./ICommentRepository";

/** Repositories bound to one discussion transaction; writes through them commit or roll back together. */
export interface DiscussionTx {
  comments: IBoardCommentRepository;
  members: IBoardMembers;
  outbox: IOutbox;
  profiles: IProfileReader;
}
