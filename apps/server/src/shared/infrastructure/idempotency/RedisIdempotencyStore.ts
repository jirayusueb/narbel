import type {
  IIdempotencyStore,
  IdempotencyClaim,
} from "../../application/interfaces/IIdempotencyStore";

/** The slice of ioredis the store uses, so tests can fake it. */
export interface IdempotencyRedis {
  set(
    key: string,
    value: string,
    mode: "EX",
    ttl: number,
    nx?: "NX"
  ): Promise<unknown>;
  get(key: string): Promise<string | null>;
  del(...keys: string[]): Promise<unknown>;
}

type Stored =
  | { state: "pending"; fingerprint: string }
  | { state: "done"; fingerprint: string; status: number; body: string };

const PENDING_TTL_SECONDS = 60;
const DONE_TTL_SECONDS = 86_400;

// A Redis outage must not take writes down: every method logs and degrades to "no dedupe".
export class RedisIdempotencyStore implements IIdempotencyStore {
  constructor(private readonly redis: IdempotencyRedis) {}

  async claim(key: string, fingerprint: string): Promise<IdempotencyClaim> {
    try {
      const pending: Stored = { state: "pending", fingerprint };
      const won = await this.redis.set(
        key,
        JSON.stringify(pending),
        "EX",
        PENDING_TTL_SECONDS,
        "NX"
      );
      if (won === "OK") {
        return { kind: "proceed" };
      }
      const raw = await this.redis.get(key);
      if (raw === null) {
        // expired between SET and GET: the original attempt is gone, so run again untracked
        return { kind: "untracked" };
      }
      const stored = JSON.parse(raw) as Stored;
      if (stored.fingerprint !== fingerprint) {
        return { kind: "mismatch" };
      }
      return stored.state === "done"
        ? { kind: "replay", status: stored.status, body: stored.body }
        : { kind: "pending" };
    } catch (error) {
      console.error(`Idempotency claim failed for ${key}`, error);
      return { kind: "untracked" };
    }
  }

  async complete(
    key: string,
    fingerprint: string,
    status: number,
    body: string
  ) {
    const done: Stored = { state: "done", fingerprint, status, body };
    try {
      await this.redis.set(key, JSON.stringify(done), "EX", DONE_TTL_SECONDS);
    } catch (error) {
      console.error(`Idempotency complete failed for ${key}`, error);
    }
  }

  async release(key: string) {
    try {
      await this.redis.del(key);
    } catch (error) {
      console.error(`Idempotency release failed for ${key}`, error);
    }
  }
}
