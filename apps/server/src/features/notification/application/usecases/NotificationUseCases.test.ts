import { describe, expect, it } from "bun:test";

import type {
  INotificationRepository,
  NotificationDto,
  NotificationPage,
} from "../../../../shared/application/interfaces/INotifications";
import type { IPubSub } from "../../../../shared/application/interfaces/IPubSub";
import type { IReadableBoards } from "../ports/IReadableBoards";
import { NotificationUseCases } from "./NotificationUseCases";

const pubsub = {} as IPubSub;

class RecordingRepo implements INotificationRepository {
  listedWith: string[] | null = null;
  markedWith: string[] | null = null;
  constructor(private readonly page: NotificationPage) {}
  add() {
    return Promise.resolve();
  }
  deleteForBoard() {
    return Promise.resolve();
  }
  list(
    _userId: string,
    _page: { cursor: string | null; limit: number },
    readableBoardIds: string[]
  ) {
    this.listedWith = readableBoardIds;
    return Promise.resolve(this.page);
  }
  markRead(_userId: string, _ids: string[] | undefined, readable: string[]) {
    this.markedWith = readable;
    return Promise.resolve(2);
  }
}

const invited = (boardId: string, boardTitle: string): NotificationDto => ({
  kind: "board.invited",
  boardId,
  boardTitle,
  actor: { userId: "a", username: null, name: "A" },
  id: `n-${boardId}`,
  createdAt: new Date().toISOString(),
  readAt: null,
});

const titleOf = (item: NotificationDto | undefined) =>
  item && item.kind === "board.invited" ? item.boardTitle : undefined;

const pageOf = (items: NotificationDto[]): NotificationPage => ({
  items,
  nextCursor: null,
  unreadCount: items.length,
});

describe("NotificationUseCases list", () => {
  it("asks boards which boards are readable and passes the set down", async () => {
    const repo = new RecordingRepo(pageOf([]));
    const readable: IReadableBoards = {
      readableBoards: () =>
        Promise.resolve([
          { id: "b1", title: "T1" },
          { id: "b2", title: "T2" },
        ]),
    };
    const uc = new NotificationUseCases(repo, pubsub, readable);
    await uc.list("u1", "u1@x.io", {});
    expect(repo.listedWith).toEqual(["b1", "b2"]);
  });

  it("shows an invitation under the board's current title", async () => {
    const repo = new RecordingRepo(pageOf([invited("b1", "Old title")]));
    const uc = new NotificationUseCases(repo, pubsub, {
      readableBoards: () => Promise.resolve([{ id: "b1", title: "New title" }]),
    });
    const result = await uc.list("u1", "u1@x.io", {});
    expect(titleOf(result.isOk() ? result.value.items[0] : undefined)).toBe(
      "New title"
    );
  });

  it("keeps the sent title when the board is gone from the readable set", async () => {
    const repo = new RecordingRepo(pageOf([invited("b9", "Old title")]));
    const uc = new NotificationUseCases(repo, pubsub, {
      readableBoards: () => Promise.resolve([]),
    });
    const result = await uc.list("u1", "u1@x.io", {});
    expect(titleOf(result.isOk() ? result.value.items[0] : undefined)).toBe(
      "Old title"
    );
  });

  it("markRead counts only readable boards", async () => {
    const repo = new RecordingRepo(pageOf([]));
    const uc = new NotificationUseCases(repo, pubsub, {
      readableBoards: () => Promise.resolve([{ id: "b1", title: "T1" }]),
    });
    const result = await uc.markRead("u1", "u1@x.io");
    expect(repo.markedWith).toEqual(["b1"]);
    expect(result.isOk() && result.value.unreadCount).toBe(2);
  });
});
