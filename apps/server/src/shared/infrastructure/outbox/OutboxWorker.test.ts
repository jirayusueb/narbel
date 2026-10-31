import { describe, expect, it } from "bun:test";

import type {
  Email,
  IEmailSender,
} from "../../application/interfaces/IEmailSender";
import type {
  ClaimedMessage,
  IOutboxStore,
} from "../../application/interfaces/IOutboxStore";
import {
  DEFAULT_OUTBOX_POLICY,
  OutboxWorker,
  UnreadableEventError,
  backoffSeconds,
} from "./OutboxWorker";
import type { EventConsumer } from "./OutboxWorker";

const mention = (id: string) => ({
  type: "email.mentioned",
  to: `${id}@x.io`,
  boardId: "b1",
  commentId: "c1",
  actorName: "Ann",
  excerpt: "hi",
});

interface Row {
  id: string;
  type: string;
  payload: unknown;
  status: "pending" | "sent" | "dead";
  attempts: number;
  nextAttemptAt: Date;
  lastError: string | null;
}

/** Same contract as DrizzleOutboxStore, kept in memory. */
class MemoryStore implements IOutboxStore {
  readonly rows: Row[] = [];
  failMarkSentOnce = false;

  add(id: string, type = "email.mentioned", payload: unknown = mention(id)) {
    this.rows.push({
      id,
      type,
      payload,
      status: "pending",
      attempts: 0,
      nextAttemptAt: new Date(0),
      lastError: null,
    });
  }

  claimDue(
    now: Date,
    limit: number,
    leaseUntil: (attemptsBefore: number) => Date
  ): Promise<ClaimedMessage[]> {
    const due = this.rows
      .filter((r) => r.status === "pending" && r.nextAttemptAt <= now)
      .slice(0, limit);
    return Promise.resolve(
      due.map((row) => {
        row.nextAttemptAt = leaseUntil(row.attempts);
        row.attempts += 1;
        return {
          id: row.id,
          type: row.type,
          payload: row.payload,
          attempts: row.attempts,
        };
      })
    );
  }

  markSent(id: string) {
    if (this.failMarkSentOnce) {
      this.failMarkSentOnce = false;
      return Promise.reject(new Error("crash before mark-sent"));
    }
    this.pending(id).status = "sent";
    return Promise.resolve();
  }

  markFailed(id: string, error: string, dead: boolean, retryAt: Date) {
    const row = this.pending(id);
    row.lastError = error;
    row.status = dead ? "dead" : "pending";
    row.nextAttemptAt = retryAt;
    return Promise.resolve();
  }

  row(id: string) {
    return this.pending(id);
  }

  private pending(id: string) {
    const row = this.rows.find((r) => r.id === id);
    if (!row) {
      throw new Error(`no row ${id}`);
    }
    return row;
  }
}

class RecordingSender implements IEmailSender {
  readonly sent: { email: Email; key: string }[] = [];
  failing = false;
  send(email: Email, key: string) {
    if (this.failing) {
      return Promise.reject(new Error("Resend 500: down"));
    }
    this.sent.push({ email, key });
    return Promise.resolve();
  }
}

const LEASE_SLACK =
  (DEFAULT_OUTBOX_POLICY.batchSize * DEFAULT_OUTBOX_POLICY.sendTimeoutMs) /
  1000;
const setup = (
  policy = DEFAULT_OUTBOX_POLICY,
  consume?: (store: MemoryStore) => EventConsumer
) => {
  const store = new MemoryStore();
  const sender = new RecordingSender();
  const clock = { now: new Date("2026-01-01T00:00:00Z") };
  const worker = new OutboxWorker(
    store,
    sender,
    { webOrigin: "http://web" },
    policy,
    () => clock.now,
    consume?.(store)
  );
  const advance = (seconds: number) => {
    clock.now = new Date(clock.now.getTime() + seconds * 1000);
  };
  return { store, sender, worker, advance };
};

describe("events", () => {
  it("hands an event to its consumer once and sends the email it queued in the same tick", async () => {
    const handled: string[] = [];
    const { store, sender, worker } = setup(
      DEFAULT_OUTBOX_POLICY,
      (s) => (id) => {
        handled.push(id);
        s.add(`mail-for-${id}`);
        return Promise.resolve();
      }
    );
    store.add("e1", "event.people-mentioned", {
      type: "event.people-mentioned",
    });
    expect(await worker.tick()).toBe(2);
    expect(handled).toEqual(["e1"]);
    expect(store.row("e1").status).toBe("sent");
    expect(sender.sent.map((s) => s.key)).toEqual(["mail-for-e1"]);
  });

  it("parks an event nobody can read as dead and retries one whose consumer failed", async () => {
    const { store, worker } = setup(
      DEFAULT_OUTBOX_POLICY,
      () => (id) =>
        Promise.reject(
          id === "bad"
            ? new UnreadableEventError("bad shape")
            : new Error("db down")
        )
    );
    store.add("bad", "event.thread-replied", {});
    store.add("flaky", "event.thread-replied", {});
    await worker.tick();
    expect(store.row("bad")).toMatchObject({
      status: "dead",
      lastError: "bad shape",
    });
    expect(store.row("flaky")).toMatchObject({
      status: "pending",
      lastError: "db down",
    });
  });

  it("never sends an event as email when no consumer is registered", async () => {
    const { store, sender, worker } = setup();
    store.add("e1", "event.thread-resolved", {});
    await worker.tick();
    expect(store.row("e1").status).toBe("dead");
    expect(sender.sent).toHaveLength(0);
  });
});

describe("backoff", () => {
  it("is 30s * 2^attempts capped at an hour", () => {
    const seconds = [0, 1, 2, 6, 7].map((n) =>
      backoffSeconds(n, DEFAULT_OUTBOX_POLICY)
    );
    expect(seconds).toEqual([30, 60, 120, 1920, 3600]);
  });
});

describe("OutboxWorker", () => {
  it("renders, sends with the outbox id as Idempotency-Key, and marks sent", async () => {
    const { store, sender, worker } = setup();
    store.add("m1");
    expect(await worker.tick()).toBe(1);
    expect(store.row("m1").status).toBe("sent");
    expect(sender.sent[0]?.key).toBe("m1");
    expect(sender.sent[0]?.email).toMatchObject({ to: "m1@x.io" });
    expect(sender.sent[0]?.email.html).toContain(
      "http://web/boards/b1?comment=c1"
    );
    expect(await worker.tick()).toBe(0);
  });

  it("retries a failed send after exactly its backoff, doubling each time", async () => {
    const { store, sender, worker, advance } = setup();
    sender.failing = true;
    store.add("m1");
    await worker.tick();
    expect(store.row("m1")).toMatchObject({ status: "pending", attempts: 1 });
    expect(store.row("m1").lastError).toContain("Resend 500");
    expect(await worker.tick()).toBe(0);
    advance(29);
    expect(await worker.tick()).toBe(0);
    advance(1);
    expect(await worker.tick()).toBe(1);
    advance(59);
    expect(await worker.tick()).toBe(0);
    advance(1);
    expect(await worker.tick()).toBe(1);
    expect(store.row("m1").attempts).toBe(3);
  });

  it("leases an in-flight row past a whole slow batch so another worker cannot take it", async () => {
    const { store, worker, advance } = setup();
    store.add("m1");
    await store.claimDue(
      new Date("2026-01-01T00:00:00Z"),
      1,
      () =>
        new Date(Date.parse("2026-01-01T00:00:00Z") + (30 + LEASE_SLACK) * 1000)
    );
    advance(30 + LEASE_SLACK - 1);
    expect(await worker.tick()).toBe(0);
    advance(1);
    expect(await worker.tick()).toBe(1);
  });

  it("parks the message as dead after the last attempt and never retries it", async () => {
    const { store, sender, worker, advance } = setup();
    sender.failing = true;
    store.add("m1");
    for (let attempt = 1; attempt <= 8; attempt += 1) {
      expect(await worker.tick()).toBe(1);
      expect(store.row("m1").status).toBe(attempt === 8 ? "dead" : "pending");
      advance(3600);
    }
    expect(await worker.tick()).toBe(0);
    expect(store.row("m1").attempts).toBe(8);
  });

  it("delivers after earlier failures once the provider recovers", async () => {
    const { store, sender, worker, advance } = setup();
    sender.failing = true;
    store.add("m1");
    await worker.tick();
    sender.failing = false;
    advance(30 + LEASE_SLACK);
    await worker.tick();
    expect(store.row("m1")).toMatchObject({ status: "sent", attempts: 2 });
  });

  it("kills unknown types and unrenderable payloads immediately", async () => {
    const { store, sender, worker } = setup();
    store.add("unknown", "email.nope");
    store.add("broken", "email.mentioned", { type: "email.mentioned", to: 3 });
    await worker.tick();
    expect(store.row("unknown")).toMatchObject({ status: "dead", attempts: 1 });
    expect(store.row("broken").status).toBe("dead");
    expect(sender.sent).toHaveLength(0);
  });

  it("re-sends with the same Idempotency-Key after a crash between send and mark-sent", async () => {
    const { store, sender, worker, advance } = setup();
    store.add("m1");
    store.failMarkSentOnce = true;
    await expect(worker.tick()).rejects.toThrow("crash before mark-sent");
    expect(store.row("m1").status).toBe("pending");
    advance(30 + LEASE_SLACK);
    await worker.tick();
    expect(store.row("m1").status).toBe("sent");
    expect(sender.sent.map((s) => s.key)).toEqual(["m1", "m1"]);
  });

  it("claims at most one batch per pass", async () => {
    const { store, worker } = setup({ ...DEFAULT_OUTBOX_POLICY, batchSize: 2 });
    for (const id of ["a", "b", "c"]) {
      store.add(id);
    }
    expect(await worker.tick()).toBe(2);
    expect(await worker.tick()).toBe(1);
  });

  it("fails a send that never resolves, so stop() returns and the row stays pending", async () => {
    const { store, sender, worker } = setup({
      ...DEFAULT_OUTBOX_POLICY,
      sendTimeoutMs: 20,
    });
    sender.send = () => Promise.withResolvers<undefined>().promise;
    store.add("m1");
    worker.start(1_000_000);
    const pass = worker.tick();
    await worker.stop();
    expect(await pass).toBe(1);
    expect(store.row("m1")).toMatchObject({ status: "pending", attempts: 1 });
    expect(store.row("m1").lastError).toContain("timed out");
  });
});
