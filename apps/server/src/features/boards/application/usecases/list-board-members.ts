import type {
  IProfileReader,
  UserRef,
} from "../../../../shared/application/interfaces/i-profiles";
import { toUserRef } from "../../../../shared/application/interfaces/i-profiles";
import type { AppError } from "../../../../shared/kernel/errors/app-error";
import type { Actor } from "../../../../shared/kernel/types/actor";
import { err, ok } from "../../../../shared/kernel/types/result";
import type { Result } from "../../../../shared/kernel/types/result";
import type { Role } from "../../domain/values/access";
import type { AccessPolicy } from "../access-policy";
import type { IBoardAccessRepository } from "../ports/i-board-access-repository";

export interface MemberDto {
  userId: string;
  name: string;
  username: string | null;
  avatarUrl: string | null;
  role: Role;
}

/** Everyone who can be assigned or mentioned: the owner first, then the access rows. */
export class ListBoardMembers {
  constructor(
    private readonly policy: AccessPolicy,
    private readonly grants: IBoardAccessRepository,
    private readonly profiles: IProfileReader
  ) {}

  async execute(input: {
    actor: Actor;
    boardId: string;
  }): Promise<Result<MemberDto[], AppError>> {
    const granted = await this.policy.decide(
      input.boardId,
      input.actor,
      "read"
    );
    if (granted.isErr()) {
      return err(granted.error);
    }
    const roles: { userId: string; role: Role }[] = [
      { userId: granted.value.board.ownerId, role: "owner" },
      ...(await this.grants.listMemberRoles(input.boardId)),
    ];
    const found = await this.profiles.findPeople(roles.map((r) => r.userId));
    const people = new Map<string, UserRef>(
      found.map((p) => [p.id, toUserRef(p)])
    );
    return ok(
      roles.flatMap(({ userId, role }) => {
        const person = people.get(userId);
        return person
          ? [
              {
                userId,
                name: person.name,
                username: person.username,
                avatarUrl: person.avatarUrl,
                role,
              },
            ]
          : [];
      })
    );
  }
}
