import type { BoardsEvent } from "../../../../shared/application/events/boards-event";
import type { IIdGenerator } from "../../../../shared/application/interfaces/i-id-generator";
import type { IUnitOfWork } from "../../../../shared/application/interfaces/i-unit-of-work";
import type { AppError } from "../../../../shared/kernel/errors/app-error";
import type { Actor } from "../../../../shared/kernel/types/actor";
import { err, ok } from "../../../../shared/kernel/types/result";
import type { Result } from "../../../../shared/kernel/types/result";
import type { Board } from "../../domain/entities/board";
import type { MemberRole, Visibility } from "../../domain/values/access";
import { Password } from "../../domain/values/password";
import { ShareLink } from "../../domain/values/share-link";
import type { AccessPolicy } from "../access-policy";
import { toAccessDto } from "../dtos/access-dto";
import type { BoardAccessDto } from "../dtos/access-dto";
import type { BoardTx } from "../ports/board-tx";
import type { IPasswordHasher } from "../ports/i-password-hasher";

export interface AccessPatch {
  visibility?: Visibility;
  /** a string sets the password, null removes it */
  password?: string | null;
  shareTokenEnabled?: boolean;
  shareRole?: MemberRole;
  /** ISO date, or null for a link that never expires */
  shareExpiresAt?: string | null;
}

export class UpdateBoardAccess {
  constructor(
    private readonly policy: AccessPolicy,
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
    const granted = await this.policy.decide(
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
      const existing = await tx.grants.findShare(board.value.id);
      const share = await this.applyShare(
        tx,
        board.value,
        existing,
        input.patch,
        now
      );
      if (share.isErr()) {
        return err(share.error);
      }
      // both helpers hand back what they were given when nothing changed
      if (board.value !== granted.value.board || share.value !== existing) {
        const event: BoardsEvent = {
          type: "event.access-changed",
          version: 1,
          boardId: board.value.id,
        };
        await tx.outbox.publish(event);
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
      const valid = Password.parse(patch.password);
      if (valid.isErr()) {
        return err(valid.error);
      }
      passwordHash = await this.hasher.hash(valid.value.value);
    } else if (patch.password === null) {
      passwordHash = null;
    }
    const visibility = patch.visibility ?? board.visibility;
    const updated = board.protect(visibility, passwordHash, now);
    if (updated.isErr()) {
      return updated;
    }
    if (
      visibility === board.visibility &&
      passwordHash === board.passwordHash
    ) {
      return ok(board);
    }
    await tx.boards.save(updated.value);
    return updated;
  }

  private async applyShare(
    tx: BoardTx,
    board: Board,
    existing: ShareLink | null,
    patch: AccessPatch,
    now: Date
  ): Promise<Result<ShareLink | null, AppError>> {
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
      const parsed = ShareLink.parseExpiry(patch.shareExpiresAt, now);
      if (parsed.isErr()) {
        return err(parsed.error);
      }
      expiresAt = parsed.value;
    } else if (patch.shareExpiresAt === null) {
      expiresAt = null;
    }
    const share = ShareLink.create({
      boardId: board.id,
      token: existing?.token ?? this.ids.token(),
      role: patch.shareRole ?? existing?.role ?? "viewer",
      createdAt: existing?.createdAt ?? now,
      expiresAt,
    });
    await tx.grants.saveShare(share);
    return ok(share);
  }
}
