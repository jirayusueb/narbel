import { and, eq, isNull, or } from "@narbel/db";
import type { Database } from "@narbel/db";
import { user } from "@narbel/db/schema/auth";
import { boardAccess, boardShare } from "@narbel/db/schema/board";

import type {
  IBoardAccessRepository,
  Share,
} from "../../application/ports/IBoardAccessRepository";

export class DrizzleBoardAccessRepository implements IBoardAccessRepository {
  constructor(private readonly db: Database) {}

  async findMemberRole(
    boardId: string,
    who: { userId: string; email: string | undefined }
  ) {
    const email = who.email?.toLowerCase();
    const [row] = await this.db
      .select()
      .from(boardAccess)
      .where(
        and(
          eq(boardAccess.boardId, boardId),
          email
            ? or(eq(boardAccess.userId, who.userId), eq(boardAccess.email, email))
            : eq(boardAccess.userId, who.userId)
        )
      )
      .limit(1);
    if (!row) {
      return null;
    }
    if (row.userId === null) {
      await this.db
        .update(boardAccess)
        .set({ userId: who.userId })
        .where(and(eq(boardAccess.id, row.id), isNull(boardAccess.userId)));
    }
    return row.role;
  }

  async listMembers(boardId: string) {
    const rows = await this.db
      .select({
        userId: boardAccess.userId,
        email: boardAccess.email,
        role: boardAccess.role,
        name: user.name,
      })
      .from(boardAccess)
      .leftJoin(user, eq(user.email, boardAccess.email))
      .where(eq(boardAccess.boardId, boardId))
      .orderBy(boardAccess.createdAt);
    return rows.map((row) => ({ ...row, name: row.name ?? row.email }));
  }

  async upsertMember(
    boardId: string,
    member: { email: string; userId: string | null; role: "editor" | "viewer" }
  ) {
    await this.db
      .insert(boardAccess)
      .values({ id: crypto.randomUUID(), boardId, ...member })
      .onConflictDoUpdate({
        target: [boardAccess.boardId, boardAccess.email],
        set: { role: member.role },
      });
  }

  async removeMember(boardId: string, key: string) {
    const removed = await this.db
      .delete(boardAccess)
      .where(
        and(
          eq(boardAccess.boardId, boardId),
          or(eq(boardAccess.userId, key), eq(boardAccess.email, key.toLowerCase()))
        )
      )
      .returning({ id: boardAccess.id });
    return removed.length > 0;
  }

  async findUserIdByEmail(email: string) {
    const [row] = await this.db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, email))
      .limit(1);
    return row?.id ?? null;
  }

  async findShare(boardId: string) {
    const [row] = await this.db
      .select()
      .from(boardShare)
      .where(eq(boardShare.boardId, boardId))
      .limit(1);
    return row ?? null;
  }

  async saveShare(share: Share) {
    await this.db
      .insert(boardShare)
      .values(share)
      .onConflictDoUpdate({
        target: boardShare.boardId,
        set: { role: share.role, expiresAt: share.expiresAt },
      });
  }

  async deleteShare(boardId: string) {
    await this.db.delete(boardShare).where(eq(boardShare.boardId, boardId));
  }
}
