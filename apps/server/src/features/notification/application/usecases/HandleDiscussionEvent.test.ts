import { describe, expect, it } from "bun:test";

import type {
  INotificationRepository,
  NotificationPayload,
} from "../../../../shared/application/interfaces/INotifications";
import type {
  IOutbox,
  OutboxEvent,
  OutboxMessage,
} from "../../../../shared/application/interfaces/IOutbox";
import type { IUnitOfWork } from "../../../../shared/application/interfaces/IUnitOfWork";
import { discussionEventSchema } from "../../infrastructure/events/discussionEventSchema";
import { HandleDiscussionEvent } from "./HandleDiscussionEvent";
import type { NotificationTx } from "./HandleDiscussionEvent";

const inMemory = (deleted: string[] = []) => {
  const sent: { userId: string; payload: NotificationPayload }[] = [];
  const queued: { message: OutboxMessage | OutboxEvent; key: string }[] = [];
  const seen = new Set<string>();
  const notifications = {
    add: (userId: string, payload: NotificationPayload) => {
      sent.push({ userId, payload });
      return Promise.resolve();
    },
  } as unknown as INotificationRepository;
  const outbox: IOutbox = {
    enqueue: (message, key) => {
      queued.push({ message, key });
      return Promise.resolve();
    },
    publish: () => Promise.reject(new Error("the consumer publishes nothing")),
    forget: () => Promise.resolve(),
  };
  const tx: NotificationTx = {
    notifications,
    outbox,
    processed: {
      claim: (consumer, id) => {
        const key = `${consumer}:${id}`;
        const fresh = !seen.has(key);
        seen.add(key);
        return Promise.resolve(fresh);
      },
    },
    people: {
      findPeople: (ids) =>
        Promise.resolve(
          ids
            .filter((id) => !deleted.includes(id))
            .map((id) => ({
              id,
              name: id,
              username: null,
              avatarUrl: null,
              email: `${id}@x.io`,
            }))
        ),
      findByUsernames: () => Promise.resolve([]),
    },
  };
  const uow: IUnitOfWork<NotificationTx> = { run: (work) => work(tx) };
  return { sent, queued, handler: new HandleDiscussionEvent(uow) };
};

const base = {
  version: 1 as const,
  boardId: "b1",
  commentId: "c1",
  threadId: "c1",
  actor: { userId: "owner", username: "olive", name: "Olive" },
};

describe("HandleDiscussionEvent with a deleted recipient", () => {
  it("still tells the others and queues nothing for the deleted person", async () => {
    const { sent, queued, handler } = inMemory(["vi"]);
    await handler.execute("e9", {
      type: "event.people-mentioned",
      ...base,
      excerpt: "ping",
      recipients: [
        { id: "ed", email: "ed@x.io" },
        { id: "vi", email: "vi@x.io" },
      ],
    });
    expect(sent.map((n) => n.userId)).toEqual(["ed"]);
    expect(queued.map((q) => q.key)).toEqual(["mentioned:c1:ed"]);
  });
});
describe("HandleDiscussionEvent", () => {
  it("turns a mention into one inbox entry and one email per person, with the old dedupe keys", async () => {
    const { sent, queued, handler } = inMemory();
    await handler.execute("e1", {
      type: "event.people-mentioned",
      ...base,
      excerpt: "ping",
      recipients: [
        { id: "ed", email: "ed@x.io" },
        { id: "vi", email: "vi@x.io" },
      ],
    });
    expect(sent.map((n) => [n.userId, n.payload.kind])).toEqual([
      ["ed", "comment.mentioned"],
      ["vi", "comment.mentioned"],
    ]);
    expect(queued.map((q) => q.key)).toEqual([
      "mentioned:c1:ed",
      "mentioned:c1:vi",
    ]);
  });

  it("handles a redelivered event once", async () => {
    const { sent, queued, handler } = inMemory();
    const assigned = {
      type: "event.comment-assigned" as const,
      ...base,
      excerpt: "x",
      recipient: { id: "ed", email: "ed@x.io" },
    };
    await handler.execute("e2", assigned);
    await handler.execute("e2", assigned);
    expect(sent).toHaveLength(1);
    expect(queued.map((q) => q.key)).toEqual(["assigned:c1:ed"]);
  });

  it("notifies replies and resolves without email", async () => {
    const { sent, queued, handler } = inMemory();
    await handler.execute("e3", {
      type: "event.thread-replied",
      ...base,
      excerpt: "x",
      recipientIds: ["ed"],
    });
    await handler.execute("e4", {
      type: "event.thread-resolved",
      ...base,
      recipientIds: ["ed", "vi"],
    });
    expect(sent.map((n) => n.payload.kind)).toEqual([
      "comment.reply",
      "comment.resolved",
      "comment.resolved",
    ]);
    expect(queued).toHaveLength(0);
  });

  it("the boundary schema refuses a payload notification cannot read", () => {
    expect(
      discussionEventSchema.safeParse({
        type: "event.people-mentioned",
        ...base,
      }).success
    ).toBe(false);
  });
});
