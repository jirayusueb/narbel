import type { MemberRole } from "../../domain/values/Access";
import type { ShareLink } from "../../domain/values/ShareLink";

export interface Member {
  /** null while the invited email has not signed in yet */
  userId: string | null;
  name: string;
  email: string;
  role: MemberRole;
}

export interface Share extends ShareLink {
  boardId: string;
  createdAt: Date;
}

export interface Grant {
  grantId: string;
  /** null until the invited person claims it */
  userId: string | null;
  role: MemberRole;
}

export interface IBoardAccessRepository {
  /** Matches by user id or invited email. */
  findGrant(
    boardId: string,
    who: { userId: string; email: string | undefined }
  ): Promise<Grant | null>;
  /** Attaches the person to an unclaimed grant; a claimed grant keeps its person. */
  claim(grantId: string, userId: string): Promise<void>;
  listMembers(boardId: string): Promise<Member[]>;
  /** Users (other than the owner) who hold an access row, including invites that match a registered email. */
  listMemberRoles(
    boardId: string
  ): Promise<{ userId: string; role: MemberRole }[]>;
  /** Live boards the person owns or holds a grant on (by id or email), keyed by id, with their current titles. */
  readableBoardTitles(person: {
    id: string;
    email: string;
  }): Promise<Map<string, string>>;
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
