import type { Board } from "../../domain/entities/board";
import type { MemberRole, Visibility } from "../../domain/values/access";
import type { ShareLink } from "../../domain/values/share-link";
import type { Member } from "../ports/i-board-access-repository";

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
  share: ShareLink | null,
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
