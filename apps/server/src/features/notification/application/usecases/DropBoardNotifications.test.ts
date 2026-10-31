import { describe, expect, it } from "bun:test";

import type {
  INotificationRepository,
  NotificationPayload,
} from "../../../../shared/application/interfaces/INotifications";
import type { IOutbox } from "../../../../shared/application/interfaces/IOutbox";
import type { IUnitOfWork } from "../../../../shared/application/interfaces/IUnitOfWork";
import { DropBoardNotifications } from "./DropBoardNotifications";
import type { NotificationTx } from "./HandleDiscussionEvent";

const invited = (boardId: string): NotificationPayload => ({
  kind: "board.invited",
  boardId,
  boardTitle: "T",
  actor: { userId: "owner", username: null, name: "Olive" },
});

describe("DropBoardNotifications", () => {
  it("deletes the deleted board's notifications for every user once per event", async () => {
    const stored = [invited("b1"), invited("b2"), invited("b1")];
    let deletes = 0;
    const seen = new Set<string>();
    const tx: NotificationTx = {
      notifications: {
        deleteForBoard: (boardId: string) => {
          deletes += 1;
          const keep = stored.filter((n) => n.boardId !== boardId);
          stored.splice(0, stored.length, ...keep);
          return Promise.resolve();
        },
      } as unknown as INotificationRepository,
      outbox: {} as IOutbox,
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
    const drop = new DropBoardNotifications(uow);
    const event = {
      type: "event.board-deleted" as const,
      version: 1 as const,
      boardId: "b1",
      ownerId: "owner",
    };
    await drop.execute("e1", event);
    await drop.execute("e1", event);
    expect(stored.map((n) => n.boardId)).toEqual(["b2"]);
    expect(deletes).toBe(1);
    expect([...seen]).toEqual(["notification:e1"]);
  });
});
