import type { ICache } from "../../application/interfaces/ICache";
import type { AfterCommit } from "../uow/DrizzleUnitOfWork";

const MISS = globalThis.undefined;

/**
 * Cache view for repositories bound to a transaction: reads miss (uncommitted rows must not be
 * cached) and invalidations wait for the commit.
 */
export const transactionalCache = (
  cache: ICache,
  afterCommit: AfterCommit
): ICache => ({
  get: <T>() => Promise.resolve<T | undefined>(MISS),
  set: () => Promise.resolve(),
  del: (...keys) => {
    afterCommit(() => cache.del(...keys));
    return Promise.resolve();
  },
});
