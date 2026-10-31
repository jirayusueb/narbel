import { UnreadableEventError } from "./OutboxWorker";
import type { EventConsumer } from "./OutboxWorker";

/**
 * The worker's one consumer, built from the consumers of each event type. Every consumer runs even
 * when another fails and marks what it handled under its own name, so the retried event re-runs
 * only what is still undone. A type nobody reads is parked as dead.
 */
export const routeEvents =
  (routes: Record<string, EventConsumer[]>): EventConsumer =>
  async (id, payload) => {
    const type = (payload as { type?: unknown } | null)?.type;
    if (typeof type !== "string" || !Object.hasOwn(routes, type)) {
      throw new UnreadableEventError(`no consumer reads ${String(type)}`);
    }
    const results = await Promise.allSettled(
      (routes[type] ?? []).map((consume) => consume(id, payload))
    );
    const failures = results.flatMap((result) =>
      result.status === "rejected" ? [result.reason as unknown] : []
    );
    // a consumer that can still succeed keeps the event alive even if another found it unreadable
    if (failures.length > 0) {
      throw (
        failures.find((error) => !(error instanceof UnreadableEventError)) ??
        failures[0]
      );
    }
  };
