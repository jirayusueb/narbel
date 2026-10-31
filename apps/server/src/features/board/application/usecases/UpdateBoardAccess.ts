import type { IIdGenerator } from "../../../../shared/application/interfaces/IIdGenerator";
import type { IUnitOfWork } from "../../../../shared/application/interfaces/IUnitOfWork";
import { AppError } from "../../../../shared/kernel/errors/AppError";
import type { Actor } from "../../../../shared/kernel/types/Actor";
import { err, ok } from "../../../../shared/kernel/types/Result";
import type { Result } from "../../../../shared/kernel/types/Result";
import type { Board } from "../../domain/entities/Board";
import type { MemberRole, Visibility } from "../../domain/values/Access";
import { validatePassword } from "../../domain/values/Password";
import type { BoardAccessGuard } from "../BoardAccess";
import { toAccessDto } from "../dtos/AccessDto";
import type { BoardAccessDto } from "../dtos/AccessDto";
import type { BoardTx } from "../ports/BoardTx";
import type { Share } from "../ports/IBoardAccessRepository";
import type { IPasswordHasher } from "../ports/IPasswordHasher";

export interface AccessPatch {
  visibility?: Visibility;
  /** a string sets the password, null removes it */
  password?: string | null;
  shareTokenEnabled?: boolean;
  shareRole?: MemberRole;
  /** ISO date, or null for a link that never expires */
  shareExpiresAt?: string | null;
}

const parseExpiry = (raw: string, now: Date): Result<Date, AppError> => {
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) || date <= now
    ? err(AppError.validation("shareExpiresAt must be a future date"))
    : ok(date);
};

export class UpdateBoardAccess {
  constructor(
    private readonly guard: BoardAccessGuard,
    private readonly uow: IUnitOfWork<BoardTx>,
    private readonly hasher: IPasswordHasher,
    private readonly ids: IIdGenerator,
    private readonly webOrigin: string
  ) {}

  async execute(input: {
    actor: Actor;
    boardId: string;
    patch: AccessPatch;
  }): Promise<Result<BoardAccessDto, AppError>> {
    const granted = await this.guard.require(
      input.boardId,
      input.actor,
      "owner"
    );
    if (granted.isErr()) {
      return err(granted.error);
    }
    const now = new Date();
    // protection and share link change together or not at all
    return await this.uow.run(async (tx) => {
      const board = await this.applyProtection(
        tx,
        granted.value.board,
        input.patch,
        now
      );
      if (board.isErr()) {
        return err(board.error);
      }
      const share = await this.applyShare(tx, board.value, input.patch, now);
      if (share.isErr()) {
        return err(share.error);
      }
      const members = await tx.grants.listMembers(board.value.id);
      return ok(toAccessDto(board.value, share.value, members, this.webOrigin));
    });
  }

  private async applyProtection(
    tx: BoardTx,
    board: Board,
    patch: AccessPatch,
    now: Date
  ): Promise<Result<Board, AppError>> {
    let { passwordHash } = board;
    if (typeof patch.password === "string") {
      const valid = validatePassword(patch.password);
      if (valid.isErr()) {
        return err(valid.error);
      }
      passwordHash = await this.hasher.hash(patch.password);
    } else if (patch.password === null) {
      passwordHash = null;
    }
    const visibility = patch.visibility ?? board.visibility;
    if (visibility === "password" && passwordHash === null) {
      return err(
        AppError.validation("Set a password before locking the board")
      );
    }
    if (
      visibility === board.visibility &&
      passwordHash === board.passwordHash
    ) {
      return ok(board);
    }
    const updated = board.withProtection(visibility, passwordHash, now);
    await tx.boards.save(updated);
    return ok(updated);
  }

  private async applyShare(
    tx: BoardTx,
    board: Board,
    patch: AccessPatch,
    now: Date
  ): Promise<Result<Share | null, AppError>> {
    const existing = await tx.grants.findShare(board.id);
    if (!(patch.shareTokenEnabled ?? existing !== null)) {
      if (existing) {
        await tx.grants.deleteShare(board.id);
      }
      return ok(null);
    }
    const touched =
      patch.shareTokenEnabled ||
      patch.shareRole ||
      patch.shareExpiresAt !== undefined;
    if (!touched) {
      return ok(existing);
    }
    let expiresAt = existing?.expiresAt ?? null;
    if (typeof patch.shareExpiresAt === "string") {
      const parsed = parseExpiry(patch.shareExpiresAt, now);
      if (parsed.isErr()) {
        return err(parsed.error);
      }
      expiresAt = parsed.value;
    } else if (patch.shareExpiresAt === null) {
      expiresAt = null;
    }
    const share: Share = {
      boardId: board.id,
      token: existing?.token ?? this.ids.token(),
      role: patch.shareRole ?? existing?.role ?? "viewer",
      createdAt: existing?.createdAt ?? now,
      expiresAt,
    };
    await tx.grants.saveShare(share);
    return ok(share);
  }
}
