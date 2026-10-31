import type { IBoardAccessRepository } from "./ports/IBoardAccessRepository";

/** The owner plus everyone holding an access row: who may be assigned or mentioned. */
export const memberIdsOf = async (
  board: { id: string; ownerId: string },
  grants: IBoardAccessRepository
) => {
  const roles = await grants.listMemberRoles(board.id);
  return new Set([board.ownerId, ...roles.map((m) => m.userId)]);
};
