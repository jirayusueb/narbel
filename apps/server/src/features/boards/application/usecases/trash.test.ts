import { describe, expect, it } from "bun:test";

import type { IFileStorage } from "../../../../shared/application/interfaces/IFileStorage";
import type { Actor } from "../../../../shared/kernel/types/Actor";
import { protectedBoard, setupAccess } from "../../../../testing";
import type { IBoardFileRepository } from "../../../drawing/application/ports/IBoardFileRepository";
import type { IBoardPresence } from "../../../drawing/application/ports/IBoardPresence";
import type {
  IBoardSyncGateway,
  SyncSession,
} from "../../../drawing/application/ports/IBoardSyncGateway";
import { ConnectBoardSync } from "../../../drawing/application/usecases/ConnectBoardSync";
import { FakeScenes } from "../../../drawing/application/usecases/fakes";
import { GetBoardFile } from "../../../drawing/application/usecases/GetBoardFile";
import { GetBoard } from "./GetBoard";
import { ListBoards } from "./ListBoards";
import { ListTrash } from "./ListTrash";
import { PurgeBoard } from "./PurgeBoard";
import { RestoreBoard } from "./RestoreBoard";
import { TrashBoard } from "./TrashBoard";

const owner: Actor = { userId: "owner" };
const member: Actor = { userId: "ed", email: "ed@x.io" };
const stranger: Actor = { userId: "zed" };

const setup = () => {
  const base = { ...setupAccess(), scenes: new FakeScenes() };
  base.grants.members.push({
    boardId: "b1",
    userId: "ed",
    email: "ed@x.io",
    name: "Ed",
    role: "editor",
  });
  const deleted: string[] = [];
  const storage = {
    deletePrefix: (prefix: string) => {
      deleted.push(prefix);
      return Promise.resolve();
    },
    stream: () => new ReadableStream(),
  } as unknown as IFileStorage;
  const connects: string[] = [];
  const gateway: IBoardSyncGateway = {
    connect: (boardId) => {
      connects.push(boardId);
      return Promise.resolve({ receive: () => {}, close: () => {} });
    },
  };
  const presence: IBoardPresence = {
    join: () => Promise.resolve(),
    leave: () => Promise.resolve(),
    list: () => Promise.resolve([]),
    countStrict: () => Promise.resolve(0),
  };
  const { boards, policy, scenes, uow } = base;
  return {
    ...base,
    deleted,
    connects,
    storage,
    gateway,
    presence,
    trash: new TrashBoard(policy, boards, scenes),
    restore: new RestoreBoard(policy, boards),
    purge: new PurgeBoard(policy, uow),
  };
};

const code = (result: { isErr(): boolean; error?: { code: string } }) =>
  result.isErr() ? (result as { error: { code: string } }).error.code : "ok";

describe("trash: who sees a trashed board", () => {
  it("tells former members and the owner it is gone (410) and strangers it does not exist (404)", async () => {
    const { policy, trash } = setup();
    expect((await trash.execute({ actor: owner, boardId: "b1" })).isOk()).toBe(
      true
    );
    const get = new GetBoard(policy);
    expect(code(await get.execute({ actor: owner, boardId: "b1" }))).toBe(
      "Gone"
    );
    expect(code(await get.execute({ actor: member, boardId: "b1" }))).toBe(
      "Gone"
    );
    expect(code(await get.execute({ actor: stranger, boardId: "b1" }))).toBe(
      "NotFound"
    );
    expect(code(await get.execute({ actor: {}, boardId: "b1" }))).toBe(
      "NotFound"
    );
  });

  it("applies to write and owner needs and to share links alike", async () => {
    const { policy, grants, trash } = setup();
    grants.share = {
      boardId: "b1",
      token: "t".repeat(43),
      role: "viewer",
      createdAt: new Date(),
      expiresAt: null,
    };
    await trash.execute({ actor: owner, boardId: "b1" });
    expect(code(await policy.decide("b1", member, "write"))).toBe("Gone");
    expect(code(await policy.decide("b1", owner, "owner"))).toBe("Gone");
    expect(
      code(await policy.decide("b1", { shareToken: "t".repeat(43) }, "read"))
    ).toBe("Gone");
  });

  it("drops the board from the owner's list, lists it under Trash for the owner only", async () => {
    const { boards, trash } = setup();
    await trash.execute({ actor: owner, boardId: "b1" });
    const active = await new ListBoards(boards).execute({ userId: "owner" });
    expect(active.isOk() && active.value).toEqual([]);
    const listed = await new ListTrash(boards).execute({ userId: "owner" });
    expect(listed.isOk() && listed.value.map((b) => b.id)).toEqual(["b1"]);
    expect(listed.isOk() && listed.value[0]?.trashedAt).not.toBeNull();
    const others = await new ListTrash(boards).execute({ userId: "ed" });
    expect(others.isOk() && others.value).toEqual([]);
  });

  it("refuses file reads and new sync connections", async () => {
    const { policy, trash, gateway, presence, connects, storage } = setup();
    await trash.execute({ actor: owner, boardId: "b1" });
    const files: IBoardFileRepository = {
      findById: () => Promise.resolve(null),
      save: () => Promise.resolve(true),
    };
    const read = new GetBoardFile(policy, files, storage);
    expect(
      code(await read.execute({ actor: member, boardId: "b1", fileId: "f" }))
    ).toBe("Gone");
    const connect = new ConnectBoardSync(policy, gateway, presence);
    const peer = { send: () => {}, close: () => {} };
    expect(
      code(await connect.execute({ actor: member, boardId: "b1", peer }))
    ).toBe("Gone");
    expect(
      code(await connect.execute({ actor: stranger, boardId: "b1", peer }))
    ).toBe("NotFound");
    expect(connects).toEqual([]);
  });

  it("closes a session that joined while the board was being trashed", async () => {
    const { policy, trash, presence, boards } = setup();
    let closed = 0;
    const racing: IBoardSyncGateway = {
      connect: async () => {
        await trash.execute({ actor: owner, boardId: "b1" });
        return {
          receive: () => {},
          close: () => {
            closed += 1;
          },
        } satisfies SyncSession;
      },
    };
    const connect = new ConnectBoardSync(policy, racing, presence);
    const peer = { send: () => {}, close: () => {} };
    expect(
      code(await connect.execute({ actor: member, boardId: "b1", peer }))
    ).toBe("Gone");
    expect(closed).toBe(1);
    expect(boards.rows.get("b1")?.trashedAt).not.toBeNull();
  });

  it("does not offer a password prompt for a trashed password board", async () => {
    const { boards, policy, trash } = setup();
    boards.rows.set("b1", protectedBoard("password", "hash"));
    await trash.execute({ actor: owner, boardId: "b1" });
    expect(
      code(await policy.decide("b1", { unlockProof: "bad" }, "read"))
    ).toBe("NotFound");
    expect(
      code(await policy.decide("b1", { unlockProof: "ok:b1" }, "read"))
    ).toBe("Gone");
  });
});

describe("trash: transitions", () => {
  it("trashes, evicts the live room and keeps everything else; repeating is harmless", async () => {
    const { boards, trash, scenes, grants, deleted } = setup();
    await trash.execute({ actor: owner, boardId: "b1" });
    const first = boards.rows.get("b1")?.trashedAt;
    expect(first).toBeInstanceOf(Date);
    await trash.execute({ actor: owner, boardId: "b1" });
    expect(boards.rows.get("b1")?.trashedAt).toBe(first);
    expect(scenes.evicted).toEqual(["b1", "b1"]);
    expect(scenes.discarded).toEqual([]);
    expect(grants.members).toHaveLength(1);
    expect(deleted).toEqual([]);
  });

  it("still reports success when the room save fails after the board is trashed", async () => {
    const { boards, trash, scenes } = setup();
    scenes.evict = () => Promise.reject(new Error("could not be saved"));
    const result = await trash.execute({ actor: owner, boardId: "b1" });
    expect(result.isOk()).toBe(true);
    expect(boards.rows.get("b1")?.trashedAt).toBeInstanceOf(Date);
  });

  it("restores access for members and link visitors, idempotently, without touching the scene", async () => {
    const { boards, policy, trash, restore, scenes } = setup();
    await trash.execute({ actor: owner, boardId: "b1" });
    expect(
      (await restore.execute({ actor: owner, boardId: "b1" })).isOk()
    ).toBe(true);
    expect(
      (await restore.execute({ actor: owner, boardId: "b1" })).isOk()
    ).toBe(true);
    expect(boards.rows.get("b1")?.trashedAt).toBeNull();
    expect(code(await policy.decide("b1", member, "write"))).toBe("ok");
    expect(code(await policy.decide("b1", owner, "owner"))).toBe("ok");
    expect(scenes.discarded).toEqual([]);
    const listed = await new ListBoards(boards).execute({ userId: "owner" });
    expect(listed.isOk() && listed.value.map((b) => b.id)).toEqual(["b1"]);
  });

  it("restoring a live board changes nothing", async () => {
    const { restore, boards } = setup();
    expect(
      (await restore.execute({ actor: owner, boardId: "b1" })).isOk()
    ).toBe(true);
    expect(boards.rows.get("b1")?.trashedAt).toBeNull();
  });

  it("lets only the owner trash, restore or purge, with no side effects", async () => {
    const { boards, trash, restore, purge, scenes, deleted } = setup();
    for (const actor of [member, stranger, {}]) {
      expect(code(await trash.execute({ actor, boardId: "b1" }))).toBe(
        "NotFound"
      );
    }
    expect(boards.rows.get("b1")?.trashedAt).toBeNull();
    await trash.execute({ actor: owner, boardId: "b1" });
    const evicted = scenes.evicted.length;
    for (const actor of [member, stranger, {}]) {
      expect(code(await restore.execute({ actor, boardId: "b1" }))).toBe(
        "NotFound"
      );
      expect(code(await purge.execute({ actor, boardId: "b1" }))).toBe(
        "NotFound"
      );
    }
    expect(boards.rows.get("b1")?.trashedAt).not.toBeNull();
    expect(scenes.evicted).toHaveLength(evicted);
    expect(scenes.discarded).toEqual([]);
    expect(deleted).toEqual([]);
  });

  it("purges only from Trash: the row goes and board-deleted commits with it; drawing and notification clean up when it arrives", async () => {
    const { boards, trash, purge, scenes, deleted, notifications, outbox } =
      setup();
    expect(code(await purge.execute({ actor: owner, boardId: "b1" }))).toBe(
      "Conflict"
    );
    expect(boards.rows.has("b1")).toBe(true);
    expect(outbox.events()).toEqual([]);

    await trash.execute({ actor: owner, boardId: "b1" });
    await notifications.add("ed", {
      kind: "board.invited",
      boardId: "b1",
      boardTitle: "Mine",
      actor: { userId: "owner", username: null, name: "Olive" },
    });
    expect((await purge.execute({ actor: owner, boardId: "b1" })).isOk()).toBe(
      true
    );
    expect(boards.rows.has("b1")).toBe(false);
    expect(outbox.events()).toEqual([
      {
        type: "event.board-deleted",
        version: 1,
        boardId: "b1",
        ownerId: "owner",
      },
    ]);
    // the consumers do the rest, after the commit
    expect(scenes.discarded).toEqual([]);
    expect(deleted).toEqual([]);
    expect(notifications.sent).toHaveLength(1);
    expect(code(await purge.execute({ actor: owner, boardId: "b1" }))).toBe(
      "NotFound"
    );
  });

  it("does not purge a board restored in the meantime", async () => {
    const { boards, trash, restore, scenes, deleted, uow, policy, outbox } =
      setup();
    await trash.execute({ actor: owner, boardId: "b1" });
    // the owner restores between the purge's check and its delete
    const racing = new PurgeBoard(policy, {
      run: async (work) => {
        await restore.execute({ actor: owner, boardId: "b1" });
        return uow.run(work);
      },
    });
    expect(code(await racing.execute({ actor: owner, boardId: "b1" }))).toBe(
      "Conflict"
    );
    expect(boards.rows.has("b1")).toBe(true);
    expect(deleted).toEqual([]);
    expect(scenes.discarded).toEqual([]);
    expect(outbox.events()).toEqual([]);
  });
});
