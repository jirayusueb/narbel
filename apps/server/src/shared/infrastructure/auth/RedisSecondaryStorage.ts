import type { SecondaryStorage } from "@narbel/auth";

interface MultiLike {
  incr(key: string): MultiLike;
  expire(key: string, ttl: number, mode: "NX"): MultiLike;
  exec(): Promise<[Error | null, unknown][] | null>;
}

/** The slice of ioredis the adapter uses, so tests can fake it. */
export interface SecondaryRedisLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<unknown>;
  set(key: string, value: string, mode: "EX", ttl: number): Promise<unknown>;
  del(key: string): Promise<unknown>;
  getdel(key: string): Promise<string | null>;
  multi(): MultiLike;
}

// Postgres holds every session and verification row, so a failed read or write only
// costs a cache miss. A failed delete propagates: Better Auth deletes from Redis before
// Postgres, so swallowing it would leave the session valid in Redis while Postgres
// forgets it. A failed rate-limit increment fails open (login must survive a cache outage).
// Arrow properties, not methods: Better Auth calls some of these detached (the rate limiter
// reads `secondaryStorage.increment` and calls it bare), which would lose `this`.
export class RedisSecondaryStorage implements SecondaryStorage {
  constructor(private readonly redis: SecondaryRedisLike) {}

  get = async (key: string) => {
    try {
      return await this.redis.get(key);
    } catch (error) {
      console.error(`Auth storage get failed for ${key}`, error);
      return null;
    }
  };

  set = async (key: string, value: string, ttl?: number) => {
    try {
      await (ttl
        ? this.redis.set(key, value, "EX", ttl)
        : this.redis.set(key, value));
    } catch (error) {
      console.error(`Auth storage set failed for ${key}`, error);
    }
  };

  delete = async (key: string) => {
    await this.redis.del(key);
  };

  getAndDelete = (key: string) => this.redis.getdel(key);

  increment = async (key: string, ttl: number) => {
    try {
      const results = await this.redis
        .multi()
        .incr(key)
        .expire(key, ttl, "NX")
        .exec();
      const [error, count] = results?.[0] ?? [
        new Error("transaction aborted"),
        0,
      ];
      if (error) {
        throw error;
      }
      return Number(count);
    } catch (error) {
      console.error(`Auth storage increment failed for ${key}`, error);
      return 1;
    }
  };
}
