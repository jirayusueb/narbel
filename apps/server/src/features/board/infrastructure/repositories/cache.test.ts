import { describe, expect, it } from "bun:test";

import { RedisCache } from "../../../../shared/infrastructure/cache/RedisCache";
import type { RedisLike } from "../../../../shared/infrastructure/cache/RedisCache";
import { transactionalCache } from "../../../../shared/infrastructure/cache/TransactionalCache";
import type { IBoardRepository } from "../../application/ports/IBoardRepository";
import { Board } from "../../domain/entities/Board";
import { BoardTitle } from "../../domain/values/BoardTitle";
import { CachedBoardDocumentStore } from "./CachedBoardDocumentStore";
import { CachedBoardRepository } from "./CachedBoardRepository";

/** Only the slice of ioredis RedisCache uses, backed by a map, with TTLs recorded rather than run. */
class FakeRedis implements RedisLike {
  readonly data = new Map<string, string>();
  readonly ttls = new Map<string, number>();
  failing = false;
  get(key: string) {
    return this.failing
      ? Promise.reject(new Error("down"))
      : Promise.resolve(this.data.get(key) ?? null);
  }
  set(key: string, value: string, _mode: "EX", ttl: number) {
    if (this.failing) {
      return Promise.reject(new Error("down"));
    }
    this.data.set(key, value);
    this.ttls.set(key, ttl);
    return Promise.resolve("OK");
  }
  del(...keys: string[]) {
    for (const key of keys) {
      this.data.delete(key);
    }
    return Promise.resolve(keys.length);
  }
}

const now = new Date("2026-01-01T00:00:00Z");
const board = (id = "b1", title = "Mine") =>
  Board.create(id, "owner", BoardTitle.restore(title), now);

class CountingBoards implements IBoardRepository {
  reads = 0;
  readonly rows = new Map<string, Board>();
  findById = (id: string) => {
    this.reads += 1;
    return Promise.resolve(this.rows.get(id) ?? null);
  };
  listByOwner = (ownerId: string) => {
    this.reads += 1;
    return Promise.resolve(
      [...this.rows.values()].filter((b) => b.ownerId === ownerId)
    );
  };
  listSharedWith = () => Promise.resolve([]);
  save = (b: Board) => {
    this.rows.set(b.id, b);
    return Promise.resolve();
  };
  delete = (id: string) => {
    this.rows.delete(id);
    return Promise.resolve();
  };
}

describe("RedisCache", () => {
  it("round-trips JSON with a TTL and reports misses as undefined", async () => {
    const redis = new FakeRedis();
    const cache = new RedisCache(redis);
    await cache.set("k", { a: [1, 2] }, 60);
    expect(await cache.get("k")).toEqual({ a: [1, 2] });
    expect(redis.ttls.get("k")).toBe(60);
    expect(await cache.get("missing")).toBeUndefined();
    await cache.del("k", "other");
    expect(await cache.get("k")).toBeUndefined();
  });

  it("degrades to misses instead of throwing when Redis is down", async () => {
    const redis = new FakeRedis();
    redis.failing = true;
    const cache = new RedisCache(redis);
    await cache.set("k", 1, 60);
    expect(await cache.get("k")).toBeUndefined();
    await cache.del("k");
  });
});

describe("CachedBoardRepository", () => {
  const setup = () => {
    const inner = new CountingBoards();
    inner.rows.set("b1", board());
    const redis = new FakeRedis();
    const cache = new RedisCache(redis);
    return {
      inner,
      redis,
      cache,
      repo: new CachedBoardRepository(inner, cache),
    };
  };

  it("serves repeated reads from the cache and keeps the entity intact", async () => {
    const { inner, repo } = setup();
    const first = await repo.findById("b1");
    const second = await repo.findById("b1");
    expect(inner.reads).toBe(1);
    expect(second).toMatchObject({
      id: "b1",
      ownerId: "owner",
      visibility: "private",
      passwordHash: null,
    });
    expect(second?.title.value).toBe("Mine");
    expect(second?.createdAt.toISOString()).toBe(
      first?.createdAt.toISOString()
    );
  });

  it("does not cache misses", async () => {
    const { inner, repo } = setup();
    expect(await repo.findById("nope")).toBeNull();
    inner.rows.set("nope", board("nope"));
    expect(await repo.findById("nope")).not.toBeNull();
  });

  it("caches the owner's list and invalidates it with the board on save", async () => {
    const { inner, repo } = setup();
    expect(await repo.listByOwner("owner")).toHaveLength(1);
    await repo.listByOwner("owner");
    expect(inner.reads).toBe(1);

    await repo.findById("b1");
    await repo.save(board("b1", "Renamed"));
    expect((await repo.findById("b1"))?.title.value).toBe("Renamed");
    await repo.save(board("b2"));
    expect(await repo.listByOwner("owner")).toHaveLength(2);
  });

  it("invalidates board and list on delete, and on a document save", async () => {
    const { inner, repo, cache, redis } = setup();
    await repo.findById("b1");
    await repo.listByOwner("owner");
    await repo.delete("b1");
    expect(await repo.findById("b1")).toBeNull();
    expect(await repo.listByOwner("owner")).toHaveLength(0);

    inner.rows.set("b1", board());
    await repo.findById("b1");
    await repo.listByOwner("owner");
    expect(redis.data.has("board:b1")).toBe(true);
    expect(redis.data.has("boards:user:owner")).toBe(true);
    const store = new CachedBoardDocumentStore(
      {
        load: () => Promise.resolve(null),
        save: () => Promise.resolve("owner"),
      },
      cache
    );
    await store.save("b1", new Uint8Array(), []);
    expect(redis.data.has("board:b1")).toBe(false);
    expect(redis.data.has("boards:user:owner")).toBe(false);
  });
});

describe("transactionalCache", () => {
  it("never reads or fills the cache, and invalidates only after the commit", async () => {
    const redis = new FakeRedis();
    const shared = new RedisCache(redis);
    await shared.set("board:b1", { stale: true }, 60);
    const hooks: (() => Promise<void> | void)[] = [];
    const tx = transactionalCache(shared, (hook) => hooks.push(hook));

    expect(await tx.get("board:b1")).toBeUndefined();
    await tx.set("board:b2", 1, 60);
    expect(redis.data.has("board:b2")).toBe(false);

    await tx.del("board:b1");
    expect(redis.data.has("board:b1")).toBe(true);
    for (const hook of hooks) {
      await hook();
    }
    expect(redis.data.has("board:b1")).toBe(false);
  });
});
