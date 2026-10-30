import { describe, expect, it } from "bun:test";

import { RedisAttemptLimiter } from "./RedisAttemptLimiter";
import type { RedisCounterLike } from "./RedisAttemptLimiter";

/** Counters in a map; expire records the TTL only when none is set, like EXPIRE NX. */
class FakeRedis implements RedisCounterLike {
  readonly data = new Map<string, number>();
  readonly ttls = new Map<string, number>();
  failing = false;

  get(key: string) {
    if (this.failing) {
      return Promise.reject(new Error("redis down"));
    }
    const value = this.data.get(key);
    return Promise.resolve(value === undefined ? null : String(value));
  }

  multi() {
    const ops: (() => void)[] = [];
    const pipeline = {
      incr: (key: string) => {
        ops.push(() => this.data.set(key, (this.data.get(key) ?? 0) + 1));
        return pipeline;
      },
      expire: (key: string, seconds: number) => {
        ops.push(() => {
          if (!this.ttls.has(key)) {
            this.ttls.set(key, seconds);
          }
        });
        return pipeline;
      },
      exec: () => {
        if (this.failing) {
          return Promise.reject(new Error("redis down"));
        }
        for (const op of ops) {
          op();
        }
        return Promise.resolve(ops.map(() => [null, 1] as [null, number]));
      },
    };
    return pipeline;
  }
}

describe("RedisAttemptLimiter", () => {
  it("blocks at the limit, per key, and sets the window TTL", async () => {
    const redis = new FakeRedis();
    const limiter = new RedisAttemptLimiter(redis, 3, 100);
    for (let i = 0; i < 3; i += 1) {
      expect(await limiter.isBlocked("k")).toBe(false);
      await limiter.recordFailure("k");
    }
    expect(await limiter.isBlocked("k")).toBe(true);
    expect(await limiter.isBlocked("other")).toBe(false);
    expect([...redis.ttls.values()]).toEqual([100]);
  });

  it("rejects when Redis is down instead of allowing attempts", async () => {
    const redis = new FakeRedis();
    redis.failing = true;
    const limiter = new RedisAttemptLimiter(redis);
    await expect(limiter.isBlocked("k")).rejects.toThrow("redis down");
    await expect(limiter.recordFailure("k")).rejects.toThrow("redis down");
  });
});
