import { describe, expect, test } from "bun:test";

import { Elysia } from "elysia";

import type {
  IIdempotencyStore,
  IdempotencyClaim,
} from "../../application/interfaces/IIdempotencyStore";
import { Ok } from "../../kernel/types/Result";
import { idempotencyPlugin } from "./idempotencyPlugin";
import { resultPlugin } from "./resultPlugin";

class FakeStore implements IIdempotencyStore {
  readonly records = new Map<
    string,
    { fingerprint: string; done?: { status: number; body: string } }
  >();
  down = false;
  inFlight = false;

  claim(key: string, fingerprint: string): Promise<IdempotencyClaim> {
    if (this.down) {
      return Promise.resolve({ kind: "untracked" });
    }
    if (this.inFlight) {
      return Promise.resolve({ kind: "pending" });
    }
    const found = this.records.get(key);
    if (!found) {
      this.records.set(key, { fingerprint });
      return Promise.resolve({ kind: "proceed" });
    }
    if (found.fingerprint !== fingerprint) {
      return Promise.resolve({ kind: "mismatch" });
    }
    return Promise.resolve(
      found.done ? { kind: "replay", ...found.done } : { kind: "pending" }
    );
  }
  complete(key: string, fingerprint: string, status: number, body: string) {
    this.records.set(key, { fingerprint, done: { status, body } });
    return Promise.resolve();
  }
  release(key: string) {
    this.records.delete(key);
    return Promise.resolve();
  }
}

const setup = (store: FakeStore) => {
  const calls = { count: 0 };
  let nextStatus = 201;
  const app = new Elysia()
    .state("idempotency", store as IIdempotencyStore | undefined)
    .use(resultPlugin)
    .use(idempotencyPlugin)
    .post("/things", { idempotent: true }, ({ set }) => {
      calls.count += 1;
      set.status = nextStatus;
      return new Ok({ n: calls.count });
    });
  const post = (key?: string, body?: unknown) =>
    app.handle(
      new Request("http://localhost/things", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(key === undefined ? {} : { "idempotency-key": key }),
        },
        body: JSON.stringify(body ?? { a: 1 }),
      })
    );
  return {
    calls,
    post,
    failNext: () => {
      nextStatus = 503;
    },
  };
};

describe("idempotent routes", () => {
  test("replays the first response for the same key and body", async () => {
    const { calls, post } = setup(new FakeStore());
    const first = await post("k1");
    const second = await post("k1");
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(await second.json()).toEqual(await first.json());
    expect(calls.count).toBe(1);
  });

  test("rejects the same key with a different body", async () => {
    const { calls, post } = setup(new FakeStore());
    await post("k1");
    const res = await post("k1", { a: 2 });
    expect(res.status).toBe(422);
    expect(calls.count).toBe(1);
  });

  test("answers 409 while the first request is pending", async () => {
    const store = new FakeStore();
    const { calls, post } = setup(store);
    store.inFlight = true;
    const second = await post("k1");
    expect(second.status).toBe(409);
    expect(calls.count).toBe(0);
  });

  test("frees the key after a failure so a retry runs", async () => {
    const store = new FakeStore();
    const { calls, post, failNext } = setup(store);
    failNext();
    expect((await post("k1")).status).toBe(503);
    expect(store.records.size).toBe(0);
    await post("k1");
    expect(calls.count).toBe(2);
  });

  test("rejects an oversized key and ignores a missing one", async () => {
    const { calls, post } = setup(new FakeStore());
    expect((await post("x".repeat(256))).status).toBe(400);
    await post();
    await post();
    expect(calls.count).toBe(2);
  });

  test("runs without dedupe when the store is down", async () => {
    const store = new FakeStore();
    store.down = true;
    const { calls, post } = setup(store);
    await post("k1");
    await post("k1");
    expect(calls.count).toBe(2);
  });
});
