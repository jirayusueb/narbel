import type { AppError } from "../../../../shared/kernel/errors/AppError";
import type { Actor } from "../../../../shared/kernel/types/Actor";
import type { Result } from "../../../../shared/kernel/types/Result";

/** What discussion needs to know about a board the caller reached. */
export interface ReachedBoard {
  board: { id: string; ownerId: string };
  access: { role: "owner" | "editor" | "viewer" };
}

/**
 * The boards context's answer to "may this caller read or write this board". Discussion holds
 * no access rules of its own; step 6 replaces the guard behind it with AccessPolicy.
 */
export interface IBoardAccess {
  require(
    boardId: string,
    actor: Actor,
    need: "read" | "write"
  ): Promise<Result<ReachedBoard, AppError>>;
}

/** Who belongs to a board right now: its owner and every person holding a grant. */
export interface IBoardMembers {
  idsOf(board: { id: string; ownerId: string }): Promise<Set<string>>;
}
