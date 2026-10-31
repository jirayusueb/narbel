import { describe, expect, it } from "bun:test";

import type { INotificationRepository } from "../../../../shared/application/interfaces/INotifications";
import type { IUnitOfWork } from "../../../../shared/application/interfaces/IUnitOfWork";
import { personDeletedSchema } from "../../infrastructure/events/personDeletedSchema";
import { ForgetDeletedPerson } from "./ForgetDeletedPerson";
import type { NotificationTx } from "./HandleDiscussionEvent";

const setup = () => {
  const pending = ["gone@x.io", "keep@x.io", "gone@x.io"];
  const seen = new Set<string>();
  const tx: NotificationTx = {
    notifications: {} as INotificationRepository,
    outbox: {
      enqueue: () => Promise.resolve(),
      publish: () =>
        Promise.reject(new Error("the consumer publishes nothing")),
      forget: () => Promise.reject(new Error("not this consumer")),
      forgetPendingTo: (email) => {
        for (let i = pending.length - 1; i >= 0; i -= 1) {
          if (pending[i] === email) {
            pending.splice(i, 1);
          }
        }
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
  return { pending, seen, forget: new ForgetDeletedPerson(uow) };
};

describe("ForgetDeletedPerson", () => {
  it("drops only that address's pending emails, once per event, under its own consumer name", async () => {
    const { pending, seen, forget } = setup();
    const event = personDeletedSchema.parse({
      type: "event.person-deleted",
      version: 1,
      personId: "p1",
      email: "gone@x.io",
    });
    await forget.execute("e1", event);
    await forget.execute("e1", event);
    expect(pending).toEqual(["keep@x.io"]);
    expect([...seen]).toEqual(["notification:e1"]);
  });
});
