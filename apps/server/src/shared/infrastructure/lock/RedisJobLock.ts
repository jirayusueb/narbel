import type { IJobLock } from "../../application/interfaces/IJobLock";

/** The slice of ioredis the lock uses, so tests can fake it. */
export interface LockRedisLike {
  set(
    key: string,
    value: string,
    px: "PX",
    ttl: number,
    nx: "NX"
  ): Promise<"OK" | null>;
  eval(script: string, numKeys: number, ...args: string[]): Promise<unknown>;
}

const RENEW = `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("pexpire", KEYS[1], ARGV[2]) end return 0`;
const RELEASE = `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) end return 0`;

// The lock only saves duplicate work for idempotent jobs, so when Redis is unreachable
// the job runs unguarded instead of not at all.
export class RedisJobLock implements IJobLock {
  constructor(private readonly redis: LockRedisLike) {}

  async runExclusive(name: string, ttlMs: number, job: () => Promise<void>) {
    const key = `lock:${name}`;
    const token = crypto.randomUUID();
    let acquired = false;
    try {
      acquired = (await this.redis.set(key, token, "PX", ttlMs, "NX")) === "OK";
    } catch (error) {
      console.error(
        `Job lock acquire failed for ${name}, running unguarded`,
        error
      );
      await job();
      return "ran";
    }
    if (!acquired) {
      return "skipped";
    }

    const renew = setInterval(() => {
      void this.evalOwned(RENEW, key, token, name, String(ttlMs));
    }, ttlMs / 3);
    try {
      await job();
      return "ran";
    } finally {
      clearInterval(renew);
      await this.evalOwned(RELEASE, key, token, name);
    }
  }

  private async evalOwned(
    script: string,
    key: string,
    token: string,
    name: string,
    ...args: string[]
  ) {
    try {
      await this.redis.eval(script, 1, key, token, ...args);
    } catch (error) {
      console.error(`Job lock script failed for ${name}`, error);
    }
  }
}
