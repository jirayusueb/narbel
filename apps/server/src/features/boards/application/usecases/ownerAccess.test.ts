import { describe, expect, it } from "bun:test";

import type { IFileStorage } from "../../../../shared/application/interfaces/IFileStorage";
import type { IBoardFileRepository } from "../../../drawing/application/ports/IBoardFileRepository";
import { AddBoardElements } from "../../../drawing/application/usecases/AddBoardElements";
import { DeleteBoardElements } from "../../../drawing/application/usecases/DeleteBoardElements";
import { FakeScenes } from "../../../drawing/application/usecases/fakes";
import { PresignBoardFileUpload } from "../../../drawing/application/usecases/PresignBoardFileUpload";
import { UpdateBoardElement } from "../../../drawing/application/usecases/UpdateBoardElement";
import { CreateBoard } from "./CreateBoard";
import { ids, setupAccess } from "./fakes";
import { GetBoard } from "./GetBoard";
import { ListBoards } from "./ListBoards";
import { PurgeBoard } from "./PurgeBoard";
import { RenameBoard } from "./RenameBoard";

const owner = { userId: "owner" };
const stranger = { userId: "stranger" };

const setup = () => {
  const base = { ...setupAccess(), scenes: new FakeScenes() };
  const deleted: string[] = [];
  const presigned: string[] = [];
  const fileRows = new Map<
    string,
    { id: string; mimeType: string; size: number }
  >();
  const files: IBoardFileRepository = {
    findById: (b, f) => Promise.resolve(fileRows.get(`${b}/${f}`) ?? null),
    save: (b, f) => {
      fileRows.set(`${b}/${f.id}`, f);
      return Promise.resolve(true);
    },
  };
  const storage: IFileStorage = {
    presignUpload: (key) => {
      presigned.push(key);
      return `https://s3.test/${key}?signed`;
    },
    put: () => Promise.resolve(),
    stream: () => new ReadableStream(),
    stat: () => Promise.resolve(null),
    delete: () => Promise.resolve(),
    deletePrefix: (prefix) => {
      deleted.push(prefix);
      return Promise.resolve();
    },
  };
  return { ...base, files, storage, presigned, deleted, fileRows };
};

const code = (result: { isErr(): boolean; error?: { code: string } }) =>
  result.isErr() ? (result as { error: { code: string } }).error.code : "ok";

describe("owner access", () => {
  it("lets the owner read and hides the board from everyone else", async () => {
    const { policy } = setup();
    const get = new GetBoard(policy);
    const view = await get.execute({ actor: owner, boardId: "b1" });
    expect(view.isOk() && view.value).toMatchObject({
      role: "owner",
      canWrite: true,
      shared: false,
      visibility: "private",
    });
    expect(code(await get.execute({ actor: stranger, boardId: "b1" }))).toBe(
      "NotFound"
    );
    expect(code(await get.execute({ actor: {}, boardId: "b1" }))).toBe(
      "NotFound"
    );
    expect(code(await get.execute({ actor: owner, boardId: "nope" }))).toBe(
      "NotFound"
    );
  });

  it("lists only the caller's boards", async () => {
    const { boards } = setup();
    const result = await new ListBoards(boards).execute({ userId: "stranger" });
    expect(result.isOk() && result.value).toEqual([]);
  });

  it("refuses rename, delete, presign and scene edits for non-owners without side effects", async () => {
    const { boards, policy, scenes, files, storage, presigned, deleted, uow } =
      setup();
    const intruder = { actor: stranger, boardId: "b1" };
    expect(
      code(
        await new RenameBoard(policy, boards).execute({
          ...intruder,
          title: "x",
        })
      )
    ).toBe("NotFound");
    expect(code(await new PurgeBoard(policy, uow).execute(intruder))).toBe(
      "NotFound"
    );
    expect(
      code(
        await new PresignBoardFileUpload(policy, files, storage).execute({
          ...intruder,
          fileId: "f",
          mimeType: "image/png",
          size: 1,
        })
      )
    ).toBe("NotFound");
    expect(
      code(
        await new AddBoardElements(policy, scenes, ids).execute({
          ...intruder,
          shapes: [{ type: "rectangle", x: 0, y: 0 }],
        })
      )
    ).toBe("NotFound");
    expect(boards.rows.get("b1")?.title.value).toBe("Mine");
    expect(presigned).toEqual([]);
    expect(deleted).toEqual([]);
    expect(scenes.discarded).toEqual([]);
    expect(scenes.elements.size).toBe(0);
  });

  it("validates the title on create and rename", async () => {
    const { boards, policy } = setup();
    const blank = await new CreateBoard(boards, ids).execute({
      userId: "owner",
      title: "  ",
    });
    expect(blank.isErr()).toBe(true);
    const renamed = await new RenameBoard(policy, boards).execute({
      actor: owner,
      boardId: "b1",
      title: " New ",
    });
    expect(renamed.isOk() && renamed.value.title).toBe("New");
  });

  it("purges only a trashed board and announces it to the contexts that clean up", async () => {
    const { boards, policy, outbox, uow } = setup();
    const purge = new PurgeBoard(policy, uow);
    const live = await purge.execute({ actor: owner, boardId: "b1" });
    expect(code(live)).toBe("Conflict");
    expect(boards.rows.has("b1")).toBe(true);
    expect(outbox.events()).toEqual([]);

    await boards.setTrashed("b1", new Date());
    const result = await purge.execute({ actor: owner, boardId: "b1" });
    expect(result.isOk()).toBe(true);
    expect(boards.rows.has("b1")).toBe(false);
    expect(outbox.events()).toEqual([
      {
        type: "event.board-deleted",
        version: 1,
        boardId: "b1",
        ownerId: "owner",
      },
    ]);
  });

  it("presigns once per (board, file), rejects bad types before signing", async () => {
    const { policy, files, storage, presigned, fileRows } = setup();
    const presign = new PresignBoardFileUpload(policy, files, storage);
    const base = { actor: owner, boardId: "b1", fileId: "f1", size: 3 };
    expect(
      (await presign.execute({ ...base, mimeType: "text/plain" })).isErr()
    ).toBe(true);
    expect(presigned).toEqual([]);
    const first = await presign.execute({ ...base, mimeType: "image/png" });
    expect(first.isOk() && first.value).toEqual({
      fileId: "f1",
      uploadUrl: "https://s3.test/boards/b1/f1?signed",
    });
    expect(
      (await presign.execute({ ...base, mimeType: "image/png" })).isOk()
    ).toBe(true);
    expect(fileRows.size).toBe(1);
    expect(
      code(await presign.execute({ ...base, mimeType: "image/jpeg" }))
    ).toBe("Conflict");
  });
});

describe("scene editing", () => {
  it("adds, updates and tombstones elements with bumped versions", async () => {
    const { policy, scenes } = setup();
    const actor = { actor: owner, boardId: "b1" };
    const added = await new AddBoardElements(policy, scenes, ids).execute({
      ...actor,
      shapes: [{ type: "text", x: 1, y: 2, text: "hi" }],
    });
    const id = (added.isOk() && added.value.ids[0]) || "";
    expect(scenes.elements.get(`page:main:${id}`)?.version).toBe(1);

    const update = new UpdateBoardElement(policy, scenes, ids);
    await update.execute({
      ...actor,
      id,
      patch: { text: "yo", x: 5, version: 99, id: "hijack" },
    });
    expect(scenes.elements.get(`page:main:${id}`)).toMatchObject({
      id,
      text: "yo",
      originalText: "yo",
      x: 5,
      version: 2,
    });

    const removed = await new DeleteBoardElements(policy, scenes, ids).execute({
      ...actor,
      ids: [id, "nope"],
    });
    expect(removed.isOk() && removed.value.deleted).toBe(1);
    expect(scenes.elements.get(`page:main:${id}`)).toMatchObject({
      isDeleted: true,
      version: 3,
    });
    expect(code(await update.execute({ ...actor, id, patch: { x: 1 } }))).toBe(
      "NotFound"
    );
  });

  it("targets the requested page and rejects an unknown one", async () => {
    const { policy, scenes } = setup();
    scenes.pageList.push({ id: "page:two", name: "Two" });
    const add = new AddBoardElements(policy, scenes, ids);
    const input = {
      actor: owner,
      boardId: "b1",
      shapes: [{ type: "rectangle" as const, x: 0, y: 0 }],
    };
    const added = await add.execute({ ...input, pageId: "page:two" });
    const id = (added.isOk() && added.value.ids[0]) || "";
    expect(scenes.elements.has(`page:two:${id}`)).toBe(true);
    expect(code(await add.execute({ ...input, pageId: "page:nope" }))).toBe(
      "NotFound"
    );
  });
});
