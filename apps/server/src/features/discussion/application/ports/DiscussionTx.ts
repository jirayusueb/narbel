import type { IOutbox } from "../../../../shared/application/interfaces/IOutbox";
import type { IProfileReader } from "../../../../shared/application/interfaces/IProfiles";
import type { IBoardMembers } from "./IBoardAccess";
import type { ICommentRepository } from "./ICommentRepository";

/** Repositories bound to one discussion transaction; writes through them commit or roll back together. */
export interface DiscussionTx {
  comments: ICommentRepository;
  members: IBoardMembers;
  outbox: IOutbox;
  profiles: IProfileReader;
}
