import { and, eq, inArray, isNull } from "@narbel/db";
import type { DbExecutor } from "@narbel/db";
import { profile } from "@narbel/db/schema/account";
import { user } from "@narbel/db/schema/auth";

import type {
  IProfileRepository,
  Person,
  UsernameOutcome,
} from "../../application/interfaces/IProfiles";

const UNIQUE_VIOLATION = "23505";

const isUniqueViolation = (error: unknown): boolean => {
  const cause = error instanceof Error ? error.cause : undefined;
  return [error, cause].some(
    (candidate) =>
      typeof candidate === "object" &&
      candidate !== null &&
      "code" in candidate &&
      candidate.code === UNIQUE_VIOLATION
  );
};

export class DrizzleProfileRepository implements IProfileRepository {
  /** `apiOrigin` is where `/api/users/:id/avatar` is served; clients on other origins need it absolute. */
  constructor(
    private readonly db: DbExecutor,
    private readonly apiOrigin: string
  ) {}

  private people(where: ReturnType<typeof inArray>): Promise<Person[]> {
    return this.db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        username: profile.username,
        avatarKey: profile.avatarKey,
      })
      .from(user)
      .leftJoin(profile, eq(profile.userId, user.id))
      .where(where)
      .then((rows) =>
        rows.map(({ avatarKey, ...row }) => ({
          ...row,
          avatarUrl: avatarKey
            ? `${this.apiOrigin}/api/users/${row.id}/avatar?v=${encodeURIComponent(avatarKey.split("/").pop() ?? "")}`
            : null,
        }))
      );
  }

  findPeople(ids: string[]) {
    return ids.length === 0
      ? Promise.resolve([])
      : this.people(inArray(user.id, ids));
  }

  findByUsernames(usernames: string[]) {
    return usernames.length === 0
      ? Promise.resolve([])
      : this.people(inArray(profile.username, usernames));
  }

  async findPerson(id: string) {
    const [person] = await this.findPeople([id]);
    return person ?? null;
  }

  async avatarKeyOf(userId: string) {
    const [row] = await this.db
      .select({ key: profile.avatarKey })
      .from(profile)
      .where(eq(profile.userId, userId))
      .limit(1);
    return row?.key ?? null;
  }

  async isUsernameFree(username: string) {
    const [row] = await this.db
      .select({ id: profile.userId })
      .from(profile)
      .where(eq(profile.username, username))
      .limit(1);
    return !row;
  }

  async claimUsername(
    userId: string,
    username: string
  ): Promise<UsernameOutcome> {
    try {
      await this.db
        .insert(profile)
        .values({ userId })
        .onConflictDoNothing({ target: profile.userId });
      const set = await this.db
        .update(profile)
        .set({ username })
        .where(and(eq(profile.userId, userId), isNull(profile.username)))
        .returning({ id: profile.userId });
      return set.length > 0 ? "ok" : "already-set";
    } catch (error) {
      if (isUniqueViolation(error)) {
        return "taken";
      }
      throw error;
    }
  }

  async setName(userId: string, name: string) {
    await this.db.update(user).set({ name }).where(eq(user.id, userId));
  }

  async setAvatarKey(userId: string, key: string | null) {
    await this.db
      .insert(profile)
      .values({ userId, avatarKey: key })
      .onConflictDoUpdate({
        target: profile.userId,
        set: { avatarKey: key },
      });
  }
}
