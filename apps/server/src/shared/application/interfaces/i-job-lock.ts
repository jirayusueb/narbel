/** Cross-replica mutual exclusion for idempotent jobs: a replica that loses the race skips the job. */
export interface IJobLock {
  runExclusive(
    name: string,
    ttlMs: number,
    job: () => Promise<void>
  ): Promise<"ran" | "skipped">;
}
