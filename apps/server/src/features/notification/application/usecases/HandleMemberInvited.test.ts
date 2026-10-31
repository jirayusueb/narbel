import { describe, expect, it } from "bun:test";

import type {
  INotificationRepository,
  NotificationPayload,
} from "../../../../shared/application/interfaces/INotifications";
import type {
  OutboxEvent,
  OutboxMessage,
} from "../../../../shared/application/interfaces/IOutbox";
import type { IUnitOfWork } from "../../../../shared/application/interfaces/IUnitOfWork";
import { memberInvitedSchema } from "../../infrastructure/events/memberInvitedSchema";
import type { NotificationTx } from "./HandleDiscussionEvent";
import { HandleMemberInvited } from "./HandleMemberInvited";

const setup = (alive: string[] = ["ann", "owner"]) => {
  const sent: { userId: string; payload: NotificationPayload }[] = [];
  const queued: { message: OutboxMessage | OutboxEvent; key: string }[] = [];
  const seen = new Set<string>();
  const tx: NotificationTx = {
    notifications: {
      add: (userId: string, payload: NotificationPayload) => {
        sent.push({ userId, payload });
        return Promise.resolve();
      },
    } as unknown as INotificationRepository,
    outbox: {
      enqueue: (message, key) => {
        // the outbox ignores a repeated dedupe key
        if (!queued.some((q) => q.key === key)) {
          queued.push({ message, key });
        }
        return Promise.resolve();
      },
      publish: () =>
        Promise.reject(new Error("the consumer publishes nothing")),
      forget: () => Promise.resolve(),
      forgetPendingTo: () => Promise.resolve(),
    },
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
            .filter((id) => alive.includes(id))
            .map((id) => ({
              id,
              name: id,
              username: `${id}-handle`,
              avatarUrl: null,
              email: `${id}@x.io`,
            }))
        ),
      findByUsernames: () => Promise.resolve([]),
    },
  };
  const uow: IUnitOfWork<NotificationTx> = { run: (work) => work(tx) };
  return { sent, queued, handle: new HandleMemberInvited(uow) };
};

const invited = (over: Record<string, unknown> = {}) =>
  memberInvitedSchema.parse({
    type: "event.member-invited",
    version: 1,
    boardId: "b1",
    boardTitle: "Mine",
    email: "ann@x.io",
    inviteeId: "ann",
    inviterId: "owner",
    inviterName: "Olive",
    firstInvite: true,
    ...over,
  });

describe("HandleMemberInvited", () => {
  it("notifies the invitee and queues the invite email under the old dedupe key", async () => {
    const { sent, queued, handle } = setup();
    await handle.execute("e1", invited());
    expect(sent).toEqual([
      {
        userId: "ann",
        payload: {
          kind: "board.invited",
          boardId: "b1",
          boardTitle: "Mine",
          actor: { userId: "owner", username: "owner-handle", name: "Olive" },
        },
      },
    ]);
    expect(queued).toEqual([
      {
        key: "invite:b1:ann@x.io",
        message: {
          type: "email.board-invite",
          to: "ann@x.io",
          boardId: "b1",
          boardTitle: "Mine",
          inviterName: "Olive",
        },
      },
    ]);
  });

  it("a redelivery of the same event does nothing", async () => {
    const { sent, queued, handle } = setup();
    await handle.execute("e1", invited());
    await handle.execute("e1", invited());
    expect(sent).toHaveLength(1);
    expect(queued).toHaveLength(1);
  });

  it("a re-invite with a new role does not notify again and the email dedupes", async () => {
    const { sent, queued, handle } = setup();
    await handle.execute("e1", invited());
    await handle.execute("e2", invited({ firstInvite: false }));
    expect(sent).toHaveLength(1);
    expect(queued).toHaveLength(1);
  });

  it("queues only the email when the invitee has no account or was deleted since", async () => {
    const noAccount = setup();
    await noAccount.handle.execute("e1", invited({ inviteeId: null }));
    expect(noAccount.sent).toHaveLength(0);
    expect(noAccount.queued).toHaveLength(1);
    const gone = setup(["owner"]);
    await gone.handle.execute("e1", invited());
    expect(gone.sent).toHaveLength(0);
    expect(gone.queued).toHaveLength(1);
  });
});
