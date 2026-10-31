import { describe, expect, it } from "bun:test";

import type { INotificationRepository } from "../../../../shared/application/interfaces/INotifications";
import type { IUnitOfWork } from "../../../../shared/application/interfaces/IUnitOfWork";
import { ForgetRemovedInvite } from "./ForgetRemovedInvite";
import type { NotificationTx } from "./HandleDiscussionEvent";

const setup = () => {
  const forgotten: string[] = [];
  const seen = new Set<string>();
  const tx: NotificationTx = {
    notifications: {} as INotificationRepository,
    outbox: {
      enqueue: () => Promise.resolve(),
      publish: () =>
        Promise.reject(new Error("the consumer publishes nothing")),
      forgetPendingTo: () => Promise.reject(new Error("not this consumer")),
      forget: (key) => {
        forgotten.push(key);
        return Promise.resolve();
      },
    },
    processed: {
      claim: (consumer, id) => {
        const fresh = !seen.has(`${consumer}:${id}`);
        seen.add(`${consumer}:${id}`);
        return Promise.resolve(fresh);
      },
    },
    people: {
      findPeople: () => Promise.resolve([]),
      findByUsernames: () => Promise.resolve([]),
    },
  };
  const uow: IUnitOfWork<NotificationTx> = { run: (work) => work(tx) };
  return { forgotten, seen, forget: new ForgetRemovedInvite(uow) };
};

describe("ForgetRemovedInvite", () => {
  it("forgets the invite email by its dedupe key once per event, under its own consumer name", async () => {
    const { forgotten, seen, forget } = setup();
    const removed = {
      type: "event.member-removed" as const,
      version: 1 as const,
      boardId: "b1",
      email: "p@x.io",
      personId: null,
    };
    await forget.execute("e1", removed);
    await forget.execute("e1", removed);
    expect(forgotten).toEqual(["invite:b1:p@x.io"]);
    expect([...seen]).toEqual(["notification:e1"]);
  });
});
