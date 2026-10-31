import { describe, expect, it } from "bun:test";

import type { IOutbox } from "../../application/interfaces/IOutbox";
import type { AfterCommit } from "../uow/DrizzleUnitOfWork";
import { wakeWhenQueued } from "./WakingOutbox";

const setup = () => {
  const hooks: (() => void)[] = [];
  const afterCommit: AfterCommit = (hook) => {
    hooks.push(hook as () => void);
  };
  const inner: IOutbox = {
    enqueue: () => Promise.resolve(),
    publish: () => Promise.resolve(),
    forget: () => Promise.resolve(),
  };
  let wakes = 0;
  const outbox = wakeWhenQueued(inner, afterCommit, () => {
    wakes += 1;
  });
  const commit = () => {
    for (const hook of hooks) {
      hook();
    }
    return wakes;
  };
  return { outbox, commit };
};

describe("wakeWhenQueued", () => {
  it("stays silent when nothing was queued", async () => {
    const { outbox, commit } = setup();
    await outbox.forget("k");
    expect(commit()).toBe(0);
  });

  it("wakes once a published event was queued", async () => {
    const { outbox, commit } = setup();
    await outbox.publish({ type: "event.x" });
    expect(commit()).toBe(1);
  });

  it("wakes once an enqueued message was queued", async () => {
    const { outbox, commit } = setup();
    await outbox.enqueue(
      {
        type: "email.board-invite",
        to: "a@x.io",
        boardId: "b",
        boardTitle: "t",
        inviterName: "A",
      },
      "k"
    );
    expect(commit()).toBe(1);
  });
});
