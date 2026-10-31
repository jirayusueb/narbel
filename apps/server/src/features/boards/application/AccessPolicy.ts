import { AppError } from "../../../shared/kernel/errors/AppError";
import type { Actor } from "../../../shared/kernel/types/Actor";
import { err, ok } from "../../../shared/kernel/types/Result";
import type { Result } from "../../../shared/kernel/types/Result";
import type { Board } from "../domain/entities/Board";
import type { Access, MemberRole } from "../domain/values/Access";
import { shareRoleFor } from "../domain/values/ShareLink";
import type {
  IBoardAccessRepository,
  ReadableBoard,
} from "./ports/IBoardAccessRepository";
import type { IBoardRepository } from "./ports/IBoardRepository";
import type { IUnlockTokens } from "./ports/IUnlockTokens";

export type Need = "read" | "write" | "owner";

export interface GrantedBoard {
  board: Board;
  access: Access;
}

/** The boards context's answer to "who may do what on this board", for every caller and every context. */
export class AccessPolicy {
  constructor(
    private readonly boards: IBoardRepository,
    private readonly grants: IBoardAccessRepository,
    private readonly unlock: IUnlockTokens,
    private readonly now: () => Date = () => new Date()
  ) {}

  async decide(
    boardId: string,
    actor: Actor,
    need: Need
  ): Promise<Result<GrantedBoard, AppError>> {
    const board = await this.boards.findIncludingTrashed(boardId);
    if (!board) {
      return err(AppError.notFound("Board"));
    }
    const access = board.accessFor({
      userId: actor.userId,
      grantRole: await this.grantRole(board, actor),
      shareRole: actor.shareToken
        ? shareRoleFor(
            await this.grants.findShare(board.id),
            actor.shareToken,
            this.now()
          )
        : null,
      unlocked:
        board.passwordHash !== null &&
        actor.unlockProof !== undefined &&
        this.unlock.verify(board.id, board.passwordHash, actor.unlockProof),
    });
    if (board.trashedAt) {
      // only someone who could have opened the board while it was live learns it is in Trash
      return err(
        access
          ? AppError.gone("Board is in the trash")
          : AppError.notFound("Board")
      );
    }
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

  /** Owner-only entry for the Trash actions: the board may be live or in Trash; everyone else sees nothing. */
  async decideOwnedAnyState(
    boardId: string,
    actor: Actor
  ): Promise<Result<Board, AppError>> {
    const board = await this.boards.findIncludingTrashed(boardId);
    return board?.isOwnedBy(actor.userId)
      ? ok(board)
      : err(AppError.notFound("Board"));
  }

  /** The live boards a person can read now, with their current titles and the person's role. */
  readableBoards(person: {
    id: string;
    email: string;
  }): Promise<ReadableBoard[]> {
    return this.grants.readableBoards(person);
  }

  /** The owner plus everyone holding a grant: who may be assigned or mentioned. */
  async memberIds(board: {
    id: string;
    ownerId: string;
  }): Promise<Set<string>> {
    const roles = await this.grants.listMemberRoles(board.id);
    return new Set([board.ownerId, ...roles.map((m) => m.userId)]);
  }

  /** A signed-in caller's grant role; their first access through an invited email claims the invitation. */
  private async grantRole(
    board: Board,
    actor: Actor
  ): Promise<MemberRole | null> {
    if (board.isOwnedBy(actor.userId) || !actor.userId) {
      return null;
    }
    const grant = await this.grants.findGrant(board.id, {
      userId: actor.userId,
      email: actor.email,
    });
    if (grant?.userId === null) {
      await this.grants.claim(grant.grantId, actor.userId);
    }
    return grant?.role ?? null;
  }
}
