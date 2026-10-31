import { describe, expect, it } from "bun:test";

import { UnreadableEventError } from "../../../../shared/infrastructure/outbox/OutboxWorker";
import { MemoryBus } from "../crdt/MemoryBus";
import { YjsBoardHub } from "../crdt/YjsBoardHub";
import { createLiveConsumer } from "./liveConsumer";

const store = {
  load: () => Promise.resolve(null),
  save: () => Promise.resolve("owner"),
};

const settle = async () => {
  for (let i = 0; i < 50; i += 1) {
    await Promise.resolve();
  }
};

describe("drawing.live consumer", () => {
  it("rechecks the board's peers on every instance for each access event", async () => {
    const bus = new MemoryBus();
    const consume = createLiveConsumer({ pubsub: bus });
    const decided: string[] = [];
    for (const hub of [
      new YjsBoardHub(store, bus),
      new YjsBoardHub(store, bus),
    ]) {
      await hub.connect("b1", { send: () => {}, close: () => {} }, true, () => {
        decided.push("b1");
        return Promise.resolve("write");
      });
    }

    await consume("e1", {
      type: "event.member-removed",
      version: 1,
      boardId: "b1",
      email: "a@x.io",
      personId: "u1",
    });
    await settle();
    expect(decided).toEqual(["b1", "b1"]);

    await consume("e2", {
      type: "event.access-changed",
      version: 1,
      boardId: "b1",
    });
    await settle();
    expect(decided).toHaveLength(4);
  });

  it("parks a payload it cannot read", async () => {
    const consume = createLiveConsumer({ pubsub: new MemoryBus() });
    await expect(
      consume("e1", { type: "event.access-changed", version: 2 })
    ).rejects.toBeInstanceOf(UnreadableEventError);
  });
});
