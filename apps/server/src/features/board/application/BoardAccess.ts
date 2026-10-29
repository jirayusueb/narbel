import { AppError } from "../../../shared/kernel/errors/AppError";
import { err, ok } from "../../../shared/kernel/types/Result";
import type { Result } from "../../../shared/kernel/types/Result";
import type { Board } from "../domain/entities/Board";
import { resolveAccess, shareRoleFor } from "../domain/rules/resolveAccess";
import type { Access } from "../domain/values/Access";
import type { IBoardAccessRepository } from "./ports/IBoardAccessRepository";
import type { IBoardRepository } from "./ports/IBoardRepository";
import type { IUnlockTokens } from "./ports/IUnlockTokens";

/** Everything the caller can present as proof of access. All parts are optional. */
export interface Actor {
  userId?: string;
  email?: string;
  name?: string;
  shareToken?: string;
  unlockProof?: string;
}

export type Need = "read" | "write" | "owner";

export interface GrantedBoard {
  board: Board;
  access: Access;
}

export class BoardAccessGuard {
  constructor(
    private readonly boards: IBoardRepository,
    private readonly grants: IBoardAccessRepository,
    private readonly unlock: IUnlockTokens,
    private readonly now: () => Date = () => new Date()
  ) {}

  async require(
    boardId: string,
    actor: Actor,
    need: Need
  ): Promise<Result<GrantedBoard, AppError>> {
    const board = await this.boards.findById(boardId);
    if (!board) {
      return err(AppError.notFound("Board"));
    }
    const access = await this.resolve(board, actor);
    if (!access) {
      // the one place a locked board is told apart from a missing one, so the UI can ask for the password
      return board.visibility === "password" && need !== "owner"
        ? err(
            new AppError("Forbidden", "Password required", {
              passwordRequired: true,
            })
          )
        : err(AppError.notFound("Board"));
    }
    if (need === "owner" && access.role !== "owner") {
      return err(AppError.notFound("Board"));
    }
    if (need === "write" && !access.canWrite) {
      return err(AppError.forbidden("This board is read-only for you"));
    }
    return ok({ board, access });
  }

  private async resolve(board: Board, actor: Actor): Promise<Access | null> {
    const isOwner = board.isOwnedBy(actor.userId);
    const memberRole =
      !isOwner && actor.userId
        ? await this.grants.findMemberRole(board.id, {
            userId: actor.userId,
            email: actor.email,
          })
        : null;
    const share = actor.shareToken
      ? await this.grants.findShare(board.id)
      : null;
    return resolveAccess({
      isOwner,
      memberRole,
      shareRole: shareRoleFor(share, actor.shareToken, this.now()),
      visibility: board.visibility,
      unlocked:
        board.passwordHash !== null &&
        actor.unlockProof !== undefined &&
        this.unlock.verify(board.id, board.passwordHash, actor.unlockProof),
    });
  }
}
