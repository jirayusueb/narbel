import type { ICache } from "../../application/interfaces/ICache";

/** The slice of ioredis the cache uses, so tests can fake it. */
export interface RedisLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: "EX", ttl: number): Promise<unknown>;
  del(...keys: string[]): Promise<unknown>;
}

// A cache is an optimisation: when Redis is down reads miss and writes are skipped,
// and entries a failed `del` left behind expire with their TTL.
export class RedisCache implements ICache {
  constructor(private readonly redis: RedisLike) {}

  async get<T>(key: string) {
    try {
      const raw = await this.redis.get(key);
      return raw === null ? undefined : (JSON.parse(raw) as T);
    } catch (error) {
      console.error(`Cache get failed for ${key}`, error);
      return undefined;
    }
  }

  async set(key: string, value: unknown, ttlSeconds: number) {
    try {
      await this.redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
    } catch (error) {
      console.error(`Cache set failed for ${key}`, error);
    }
  }

  async del(...keys: string[]) {
    if (keys.length === 0) {
      return;
    }
    try {
      await this.redis.del(...keys);
    } catch (error) {
      console.error(`Cache del failed for ${keys.join(",")}`, error);
    }
  }
}
