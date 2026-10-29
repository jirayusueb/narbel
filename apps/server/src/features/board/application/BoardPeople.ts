import type {
  IProfileReader,
  Person,
} from "../../../shared/application/interfaces/IProfiles";
import { AppError } from "../../../shared/kernel/errors/AppError";
import { err, ok } from "../../../shared/kernel/types/Result";
import type { Result } from "../../../shared/kernel/types/Result";
import type { IBoardAccessRepository } from "./ports/IBoardAccessRepository";

/** The owner plus everyone holding an access row: who may be assigned or mentioned. */
export const memberIdsOf = async (
  board: { id: string; ownerId: string },
  grants: IBoardAccessRepository
) => {
  const roles = await grants.listMemberRoles(board.id);
  return new Set([board.ownerId, ...roles.map((m) => m.userId)]);
};

export const requirePerson = async (
  profiles: IProfileReader,
  userId: string | undefined
): Promise<Result<Person, AppError>> => {
  const [person] = userId ? await profiles.findPeople([userId]) : [];
  return person ? ok(person) : err(AppError.unauthorized());
};
