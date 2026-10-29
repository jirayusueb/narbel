import type { Board } from "../../domain/entities/Board";
import type { MemberRole, Visibility } from "../../domain/values/Access";
import type { Member, Share } from "../ports/IBoardAccessRepository";

export interface BoardAccessDto {
  visibility: Visibility;
  hasPassword: boolean;
  share: {
    enabled: true;
    url: string;
    role: MemberRole;
    expiresAt: string | null;
  } | null;
  members: Member[];
}

export const toAccessDto = (
  board: Board,
  share: Share | null,
  members: Member[],
  webOrigin: string
): BoardAccessDto => ({
  visibility: board.visibility,
  hasPassword: board.passwordHash !== null,
  share: share
    ? {
        enabled: true,
        url: `${webOrigin}/boards/${board.id}?share=${share.token}`,
        role: share.role,
        expiresAt: share.expiresAt?.toISOString() ?? null,
      }
    : null,
  members,
});
