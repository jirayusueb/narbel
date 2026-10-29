import type { MemberRole } from "../../domain/values/Access";

export interface Member {
  /** null while the invited email has not signed in yet */
  userId: string | null;
  name: string;
  email: string;
  role: MemberRole;
}

export interface Share {
  boardId: string;
  token: string;
  role: MemberRole;
  createdAt: Date;
  expiresAt: Date | null;
}

export interface IBoardAccessRepository {
  /** Matches by user id or invited email, and links the id to the invite on first match. */
  findMemberRole(
    boardId: string,
    who: { userId: string; email: string | undefined }
  ): Promise<MemberRole | null>;
  listMembers(boardId: string): Promise<Member[]>;
  /** Users (other than the owner) who hold an access row, including invites that match a registered email. */
  listMemberRoles(
    boardId: string
  ): Promise<{ userId: string; role: MemberRole }[]>;
  upsertMember(
    boardId: string,
    member: { email: string; userId: string | null; role: MemberRole }
  ): Promise<void>;
  /** `key` is a user id or an email. Resolves the removed member's user id (null if unlinked) and email, or null when nobody matched. */
  removeMember(
    boardId: string,
    key: string
  ): Promise<{ userId: string | null; email: string } | null>;
  findUserIdByEmail(email: string): Promise<string | null>;
  findShare(boardId: string): Promise<Share | null>;
  saveShare(share: Share): Promise<void>;
  deleteShare(boardId: string): Promise<void>;
}
