import { AppError } from "../../../../shared/kernel/errors/AppError";
import { err, ok } from "../../../../shared/kernel/types/Result";
import type { Result } from "../../../../shared/kernel/types/Result";
import { buildInviteEmail } from "../../domain/rules/inviteEmail";
import type { MemberRole } from "../../domain/values/Access";
import { normalizeEmail } from "../../domain/values/Email";
import type { Actor, BoardAccessGuard } from "../BoardAccess";
import type { IBoardAccessRepository } from "../ports/IBoardAccessRepository";
import type { IEmailSender } from "../ports/IEmailSender";

export class InviteBoardMember {
  constructor(
    private readonly guard: BoardAccessGuard,
    private readonly grants: IBoardAccessRepository,
    private readonly email: IEmailSender,
    private readonly webOrigin: string
  ) {}

  async execute(input: {
    actor: Actor;
    boardId: string;
    email: string;
    role: MemberRole;
  }): Promise<Result<{ emailSent: true }, AppError>> {
    const granted = await this.guard.require(input.boardId, input.actor, "owner");
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
    // the row exists before the email goes out: the invite link works even if delivery fails
    await this.grants.upsertMember(input.boardId, {
      email: email.value,
      userId: await this.grants.findUserIdByEmail(email.value),
      role: input.role,
    });
    const sent = await this.email.send({
      to: email.value,
      ...buildInviteEmail({
        boardTitle: granted.value.board.title.value,
        inviterName: input.actor.name ?? "Someone",
        link: `${this.webOrigin}/boards/${input.boardId}`,
      }),
    });
    return sent
      ? ok({ emailSent: true })
      : err(
          AppError.badGateway("Invite saved but the email could not be sent", {
            emailSent: false,
          })
        );
  }
}
