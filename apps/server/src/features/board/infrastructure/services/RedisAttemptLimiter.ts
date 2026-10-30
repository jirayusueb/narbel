import type { IAttemptLimiter } from "../../application/ports/IAttemptLimiter";

interface Pipeline {
  incr(key: string): Pipeline;
  expire(key: string, seconds: number, mode: "NX"): Pipeline;
  exec(): Promise<[Error | null, unknown][] | null>;
}

/** The slice of ioredis the limiter uses, so tests can fake it. */
export interface RedisCounterLike {
  get(key: string): Promise<string | null>;
  multi(): Pipeline;
}

// Fixed window: EXPIRE NX starts the clock on the first failure only. Redis errors propagate so
// an outage rejects unlock attempts instead of allowing unlimited guesses.
export class RedisAttemptLimiter implements IAttemptLimiter {
  constructor(
    private readonly redis: RedisCounterLike,
    private readonly maxFailures = 10,
    private readonly windowSeconds = 60 * 60
  ) {}

  async isBlocked(key: string) {
    const count = await this.redis.get(this.redisKey(key));
    return count !== null && Number(count) >= this.maxFailures;
  }

  async recordFailure(key: string) {
    const redisKey = this.redisKey(key);
    const results = await this.redis
      .multi()
      .incr(redisKey)
      .expire(redisKey, this.windowSeconds, "NX")
      .exec();
    // exec() resolves with per-command errors instead of throwing
    const failed = results?.find(([error]) => error)?.[0];
    if (failed || !results) {
      throw failed ?? new Error("Attempt limiter transaction was discarded");
    }
  }

  private redisKey(key: string) {
    return `board:unlock-failures:${key}`;
  }
}
