import type Redis from "ioredis";

import type {
  IBoardPresence,
  Viewer,
} from "../../application/ports/IBoardPresence";

const STALE_AFTER_MS = 60_000;
const KEY_TTL_SECONDS = 120;

const membersKey = (boardId: string) => `presence:board:${boardId}`;
const viewersKey = (boardId: string) => `presence:board:${boardId}:viewers`;

// A killed server never calls leave(), so each connection is scored by last-seen time and dropped by list() once stale.
export class RedisBoardPresence implements IBoardPresence {
  constructor(
    private readonly redis: Redis,
    private readonly now: () => number = Date.now
  ) {}

  join(boardId: string, connectionId: string, viewer: Viewer) {
    return this.run("join", () =>
      this.redis
        .multi()
        .zadd(membersKey(boardId), this.now(), connectionId)
        .hset(viewersKey(boardId), connectionId, JSON.stringify(viewer))
        .expire(membersKey(boardId), KEY_TTL_SECONDS)
        .expire(viewersKey(boardId), KEY_TTL_SECONDS)
        .exec()
    );
  }

  touch(boardId: string, connectionId: string) {
    return this.run("touch", () =>
      this.redis
        .multi()
        .zadd(membersKey(boardId), "XX", this.now(), connectionId)
        .expire(membersKey(boardId), KEY_TTL_SECONDS)
        .expire(viewersKey(boardId), KEY_TTL_SECONDS)
        .exec()
    );
  }

  leave(boardId: string, connectionId: string) {
    return this.run("leave", () =>
      this.redis
        .multi()
        .zrem(membersKey(boardId), connectionId)
        .hdel(viewersKey(boardId), connectionId)
        .exec()
    );
  }

  async list(boardId: string): Promise<Viewer[]> {
    try {
      const cutoff = this.now() - STALE_AFTER_MS;
      const stale = await this.redis.zrangebyscore(
        membersKey(boardId),
        "-inf",
        `(${cutoff}`
      );
      if (stale.length > 0) {
        await this.redis
          .multi()
          .zrem(membersKey(boardId), ...stale)
          .hdel(viewersKey(boardId), ...stale)
          .exec();
      }
      const ids = await this.redis.zrange(membersKey(boardId), "0", "-1");
      if (ids.length === 0) {
        return [];
      }
      const raw = await this.redis.hmget(viewersKey(boardId), ...ids);
      return raw.flatMap((json) => (json ? [JSON.parse(json) as Viewer] : []));
    } catch (error) {
      console.error(`Presence list failed for ${boardId}`, error);
      return [];
    }
  }

  private async run(op: string, command: () => Promise<unknown>) {
    try {
      await command();
    } catch (error) {
      console.error(`Presence ${op} failed`, error);
    }
  }
}
