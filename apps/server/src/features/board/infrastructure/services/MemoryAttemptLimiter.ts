import type { IAttemptLimiter } from "../../application/ports/IAttemptLimiter";

// shortcut: per-process counters, so the limit multiplies across server replicas; move to Redis/Postgres if we scale out
export class MemoryAttemptLimiter implements IAttemptLimiter {
  private readonly failures = new Map<string, number[]>();

  constructor(
    private readonly maxFailures = 10,
    private readonly windowMs = 60 * 60 * 1000,
    private readonly now: () => number = Date.now
  ) {}

  isBlocked(key: string) {
    return this.recent(key).length >= this.maxFailures;
  }

  recordFailure(key: string) {
    this.failures.set(key, [...this.recent(key), this.now()]);
  }

  private recent(key: string) {
    const cutoff = this.now() - this.windowMs;
    const recent = (this.failures.get(key) ?? []).filter((t) => t > cutoff);
    if (recent.length === 0) {
      this.failures.delete(key);
    }
    return recent;
  }
}
