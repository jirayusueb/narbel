import type { Database, DbExecutor } from "@narbel/db";

import type { IUnitOfWork } from "../../application/interfaces/IUnitOfWork";
import { Err } from "../../kernel/types/Result";

export type AfterCommit = (hook: () => Promise<void> | void) => void;

/** Carries an `Err` out of the transaction callback so the transaction rolls back. */
class Rollback {
  constructor(readonly outcome: unknown) {}
}

/**
 * One drizzle transaction per `run`. `bind` builds the repositories on the transaction handle;
 * hooks they register through `afterCommit` run once the transaction has committed and never when it rolled back.
 */
export class DrizzleUnitOfWork<Tx> implements IUnitOfWork<Tx> {
  constructor(
    private readonly db: Database,
    private readonly bind: (db: DbExecutor, afterCommit: AfterCommit) => Tx
  ) {}

  async run<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
    const hooks: (() => Promise<void> | void)[] = [];
    try {
      const result = await this.db.transaction(async (handle) => {
        const outcome = await work(
          this.bind(handle, (hook) => hooks.push(hook))
        );
        if (outcome instanceof Err) {
          throw new Rollback(outcome);
        }
        return outcome;
      });
      await this.flush(hooks);
      return result;
    } catch (error) {
      if (error instanceof Rollback) {
        return error.outcome as T;
      }
      throw error;
    }
  }

  // the data is committed; a failed side effect must not turn that into an error for the caller
  private async flush(hooks: (() => Promise<void> | void)[]) {
    const settled = await Promise.allSettled(
      hooks.map(async (hook) => {
        await hook();
      })
    );
    for (const outcome of settled) {
      if (outcome.status === "rejected") {
        console.error("Post-commit hook failed", outcome.reason);
      }
    }
  }
}
