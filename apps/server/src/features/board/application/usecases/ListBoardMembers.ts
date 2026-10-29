import type {
  IProfileReader,
  UserRef,
} from "../../../../shared/application/interfaces/IProfiles";
import { toUserRef } from "../../../../shared/application/interfaces/IProfiles";
import type { AppError } from "../../../../shared/kernel/errors/AppError";
import { err, ok } from "../../../../shared/kernel/types/Result";
import type { Result } from "../../../../shared/kernel/types/Result";
import type { Role } from "../../domain/values/Access";
import type { Actor, BoardAccessGuard } from "../BoardAccess";
import type { IBoardAccessRepository } from "../ports/IBoardAccessRepository";

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
    private readonly guard: BoardAccessGuard,
    private readonly grants: IBoardAccessRepository,
    private readonly profiles: IProfileReader
  ) {}

  async execute(input: {
    actor: Actor;
    boardId: string;
  }): Promise<Result<MemberDto[], AppError>> {
    const granted = await this.guard.require(
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
