import type { IOutbox } from "../../application/interfaces/IOutbox";
import type { AfterCommit } from "../uow/DrizzleUnitOfWork";

/**
 * Wraps a transaction's outbox so the worker is woken after commit only when the transaction
 * queued something; a commit that queued nothing skips the worker's claim query.
 */
export const wakeWhenQueued = (
  outbox: IOutbox,
  afterCommit: AfterCommit,
  wake: () => void
): IOutbox => {
  let queued = false;
  afterCommit(() => {
    if (queued) {
      wake();
    }
  });
  return {
    enqueue: async (message, dedupeKey) => {
      await outbox.enqueue(message, dedupeKey);
      queued = true;
    },
    publish: async (event) => {
      await outbox.publish(event);
      queued = true;
    },
    forget: (dedupeKey) => outbox.forget(dedupeKey),
  };
};
