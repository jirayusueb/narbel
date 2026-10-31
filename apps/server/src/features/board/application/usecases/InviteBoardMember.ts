import type { IUnitOfWork } from "../../../../shared/application/interfaces/IUnitOfWork";
import { requirePerson } from "../../../../shared/application/requirePerson";
import { AppError } from "../../../../shared/kernel/errors/AppError";
import type { Actor } from "../../../../shared/kernel/types/Actor";
import { err, ok } from "../../../../shared/kernel/types/Result";
import type { Result } from "../../../../shared/kernel/types/Result";
import type { MemberRole } from "../../domain/values/Access";
import { normalizeEmail } from "../../domain/values/Email";
import type { BoardAccessGuard } from "../BoardAccess";
import type { BoardTx } from "../ports/BoardTx";

export class InviteBoardMember {
  constructor(
    private readonly guard: BoardAccessGuard,
    private readonly uow: IUnitOfWork<BoardTx>
  ) {}

  async execute(input: {
    actor: Actor;
    boardId: string;
    email: string;
    role: MemberRole;
  }): Promise<Result<{ queued: true }, AppError>> {
    const granted = await this.guard.require(
      input.boardId,
      input.actor,
      "owner"
    );
    if (granted.isErr()) {
      return err(granted.error);
    }
    const email = normalizeEmail(input.email);
    if (email.isErr()) {
      return err(email.error);
    }
    if (email.value === input.actor.email?.toLowerCase()) {
      return err(AppError.validation("You already own this board"));
    }
    const boardTitle = granted.value.board.title.value;
    // the access row, the in-app notice and the queued email commit together; delivery happens later
    return await this.uow.run(async (tx) => {
      const inviter = await requirePerson(tx.profiles, input.actor.userId);
      if (inviter.isErr()) {
        return err(inviter.error);
      }
      const userId = await tx.grants.findUserIdByEmail(email.value);
      const members = await tx.grants.listMembers(input.boardId);
      const alreadyInvited = members.some((m) => m.email === email.value);
      await tx.grants.upsertMember(input.boardId, {
        email: email.value,
        userId,
        role: input.role,
      });
      if (userId && !alreadyInvited) {
        await tx.notifications.add(userId, {
          kind: "board.invited",
          boardId: input.boardId,
          boardTitle,
          actor: {
            userId: inviter.value.id,
            username: inviter.value.username,
            name: inviter.value.name,
          },
        });
      }
      await tx.outbox.enqueue(
        {
          type: "email.board-invite",
          to: email.value,
          boardId: input.boardId,
          boardTitle,
          inviterName: inviter.value.name,
        },
        `invite:${input.boardId}:${email.value}`
      );
      return ok({ queued: true as const });
    });
  }
}
