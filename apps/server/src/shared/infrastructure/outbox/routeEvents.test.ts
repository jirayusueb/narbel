import { describe, expect, it } from "bun:test";

import { UnreadableEventError } from "./OutboxWorker";
import type { EventConsumer } from "./OutboxWorker";
import { routeEvents } from "./routeEvents";

const recording = (name: string, seen: string[], fails = false) =>
  ((id) => {
    seen.push(`${name}:${id}`);
    return fails
      ? Promise.reject(new Error(`${name} down`))
      : Promise.resolve();
  }) satisfies EventConsumer;

describe("routeEvents", () => {
  it("hands an event to every consumer of its type and to nobody else", async () => {
    const seen: string[] = [];
    const route = routeEvents({
      "event.a": [recording("one", seen), recording("two", seen)],
      "event.b": [recording("three", seen)],
    });
    await route("e1", { type: "event.a" });
    expect(seen).toEqual(["one:e1", "two:e1"]);
  });

  it("runs the others when one fails, then fails so the event is retried", async () => {
    const seen: string[] = [];
    const route = routeEvents({
      "event.a": [recording("one", seen, true), recording("two", seen)],
    });
    await expect(route("e1", { type: "event.a" })).rejects.toThrow("one down");
    expect(seen).toEqual(["one:e1", "two:e1"]);
  });

  it("prefers a retryable failure over an unreadable one", async () => {
    const route = routeEvents({
      "event.a": [
        () => Promise.reject(new UnreadableEventError("bad payload")),
        () => Promise.reject(new Error("db down")),
      ],
    });
    await expect(route("e1", { type: "event.a" })).rejects.toThrow("db down");
  });

  it("parks a type nobody reads, or a payload without a type, as unreadable", async () => {
    const route = routeEvents({ "event.a": [] });
    await expect(route("e1", { type: "event.zzz" })).rejects.toBeInstanceOf(
      UnreadableEventError
    );
    await expect(route("e1", { type: "toString" })).rejects.toBeInstanceOf(
      UnreadableEventError
    );
    await expect(route("e1", null)).rejects.toBeInstanceOf(
      UnreadableEventError
    );
  });
});
