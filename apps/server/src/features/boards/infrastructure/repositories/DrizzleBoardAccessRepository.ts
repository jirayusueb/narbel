import { and, eq, isNotNull, isNull, or, sql } from "@narbel/db";
import type { DbExecutor } from "@narbel/db";
import { user } from "@narbel/db/schema/auth";
import { board, boardAccess, boardShare } from "@narbel/db/schema/boards";

import type {
  IBoardAccessRepository,
  Share,
} from "../../application/ports/IBoardAccessRepository";

export class DrizzleBoardAccessRepository implements IBoardAccessRepository {
  constructor(private readonly db: DbExecutor) {}

  async findGrant(
    boardId: string,
    who: { userId: string; email: string | undefined }
  ) {
    const email = who.email?.toLowerCase();
    const [row] = await this.db
      .select({
        grantId: boardAccess.id,
        userId: boardAccess.userId,
        role: boardAccess.role,
      })
      .from(boardAccess)
      .where(
        and(
          eq(boardAccess.boardId, boardId),
          email
            ? or(
                eq(boardAccess.userId, who.userId),
                eq(boardAccess.email, email)
              )
            : eq(boardAccess.userId, who.userId)
        )
      )
      .limit(1);
    return row ?? null;
  }

  async claim(grantId: string, userId: string) {
    await this.db
      .update(boardAccess)
      .set({ userId })
      .where(and(eq(boardAccess.id, grantId), isNull(boardAccess.userId)));
  }

  async readableBoardTitles(person: { id: string; email: string }) {
    const rows = await this.db
      .select({ id: board.id, title: board.title })
      .from(board)
      .leftJoin(
        boardAccess,
        and(
          eq(boardAccess.boardId, board.id),
          or(
            eq(boardAccess.userId, person.id),
            eq(boardAccess.email, person.email.toLowerCase())
          )
        )
      )
      .where(
        and(
          or(eq(board.ownerId, person.id), isNotNull(boardAccess.id)),
          isNull(board.trashedAt)
        )
      );
    // a board matched by both user id and email comes back twice; the map keeps one
    return new Map(rows.map((row) => [row.id, row.title]));
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

  async listMemberRoles(boardId: string) {
    const rows = await this.db
      .select({
        userId: sql<string | null>`coalesce(${boardAccess.userId}, ${user.id})`,
        role: boardAccess.role,
      })
      .from(boardAccess)
      .leftJoin(user, eq(user.email, boardAccess.email))
      .where(eq(boardAccess.boardId, boardId));
    return rows.flatMap(({ userId, role }) =>
      userId ? [{ userId, role }] : []
    );
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
          or(
            eq(boardAccess.userId, key),
            eq(boardAccess.email, key.toLowerCase())
          )
        )
      )
      .returning({ userId: boardAccess.userId, email: boardAccess.email });
    return removed[0] ?? null;
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
