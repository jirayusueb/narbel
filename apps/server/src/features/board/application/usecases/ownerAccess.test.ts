import { describe, expect, it } from "bun:test";

import type { IIdGenerator } from "../../../../shared/application/interfaces/IIdGenerator";
import { Board } from "../../domain/entities/Board";
import type { SceneElement } from "../../domain/entities/SceneElement";
import { BoardTitle } from "../../domain/values/BoardTitle";
import type { IBoardFileRepository } from "../ports/IBoardFileRepository";
import type { IBoardRepository } from "../ports/IBoardRepository";
import type { IBoardScenes } from "../ports/IBoardScenes";
import type { IFileStorage } from "../ports/IFileStorage";
import { AddBoardElements } from "./AddBoardElements";
import { CreateBoard } from "./CreateBoard";
import { DeleteBoard } from "./DeleteBoard";
import { DeleteBoardElements } from "./DeleteBoardElements";
import { GetBoard } from "./GetBoard";
import { ListBoards } from "./ListBoards";
import { RenameBoard } from "./RenameBoard";
import { UpdateBoardElement } from "./UpdateBoardElement";
import { UploadBoardFile } from "./UploadBoardFile";

let counter = 0;
const ids: IIdGenerator = {
  generate: () => `id${++counter}`,
  int: () => ++counter,
};

class FakeBoards implements IBoardRepository {
  readonly rows = new Map<string, Board>();
  findById = async (id: string) => this.rows.get(id) ?? null;
  listByOwner = async (ownerId: string) =>
    [...this.rows.values()].filter((b) => b.ownerId === ownerId);
  save = async (board: Board) => void this.rows.set(board.id, board);
  delete = async (id: string) => void this.rows.delete(id);
}

class FakeScenes implements IBoardScenes {
  readonly elements = new Map<string, SceneElement>();
  discarded: string[] = [];
  transact = async <T>(
    _: string,
    fn: Parameters<IBoardScenes["transact"]>[1] extends (s: infer S) => unknown
      ? (s: S) => T
      : never
  ) =>
    fn({
      get: (id) => this.elements.get(id),
      all: () => [...this.elements.values()],
      put: (el) => void this.elements.set(el.id, el),
    });
  discard = async (id: string) => void this.discarded.push(id);
}

const setup = () => {
  const boards = new FakeBoards();
  const scenes = new FakeScenes();
  const stored: string[] = [];
  const deleted: string[] = [];
  const fileRows = new Map<
    string,
    { id: string; mimeType: string; size: number }
  >();
  const files: IBoardFileRepository = {
    find: async (b, f) => fileRows.get(`${b}/${f}`) ?? null,
    save: async (b, f) => void fileRows.set(`${b}/${f.id}`, f),
  };
  const storage: IFileStorage = {
    put: async (key) => void stored.push(key),
    stream: () => new ReadableStream(),
    deletePrefix: async (prefix) => void deleted.push(prefix),
  };
  boards.rows.set(
    "b1",
    Board.create("b1", "owner", BoardTitle.restore("Mine"), new Date())
  );
  return { boards, scenes, files, storage, stored, deleted };
};

const notFound = (result: { isErr(): boolean; error?: { code: string } }) =>
  result.isErr() &&
  (result as { error: { code: string } }).error.code === "NotFound";

describe("owner access", () => {
  it("lets the owner read and hides the board from everyone else", async () => {
    const { boards } = setup();
    const get = new GetBoard(boards);
    expect((await get.execute({ userId: "owner", boardId: "b1" })).isOk()).toBe(
      true
    );
    expect(
      notFound(await get.execute({ userId: "stranger", boardId: "b1" }))
    ).toBe(true);
    expect(
      notFound(await get.execute({ userId: "owner", boardId: "missing" }))
    ).toBe(true);
  });

  it("lists only the caller's boards", async () => {
    const { boards } = setup();
    const result = await new ListBoards(boards).execute({ userId: "stranger" });
    expect(result.isOk() && result.value).toEqual([]);
  });

  it("refuses rename, delete, upload and scene edits for non-owners without side effects", async () => {
    const { boards, scenes, files, storage, stored, deleted } = setup();
    const intruder = { userId: "stranger", boardId: "b1" };
    expect(
      notFound(
        await new RenameBoard(boards).execute({ ...intruder, title: "x" })
      )
    ).toBe(true);
    expect(
      notFound(await new DeleteBoard(boards, scenes, storage).execute(intruder))
    ).toBe(true);
    expect(
      notFound(
        await new UploadBoardFile(boards, files, storage).execute({
          ...intruder,
          fileId: "f",
          mimeType: "image/png",
          size: 1,
          read: async () => new Uint8Array(1),
        })
      )
    ).toBe(true);
    expect(
      notFound(
        await new AddBoardElements(boards, scenes, ids).execute({
          ...intruder,
          shapes: [{ type: "rectangle", x: 0, y: 0 }],
        })
      )
    ).toBe(true);
    expect(boards.rows.get("b1")?.title.value).toBe("Mine");
    expect(boards.rows.has("b1")).toBe(true);
    expect(stored).toEqual([]);
    expect(deleted).toEqual([]);
    expect(scenes.discarded).toEqual([]);
    expect(scenes.elements.size).toBe(0);
  });

  it("validates the title on create and rename", async () => {
    const { boards } = setup();
    expect(
      (
        await new CreateBoard(boards, ids).execute({
          userId: "owner",
          title: "  ",
        })
      ).isErr()
    ).toBe(true);
    const renamed = await new RenameBoard(boards).execute({
      userId: "owner",
      boardId: "b1",
      title: " New ",
    });
    expect(renamed.isOk() && renamed.value.title).toBe("New");
  });

  it("deletes the board together with its live document and stored files", async () => {
    const { boards, scenes, storage, deleted } = setup();
    const result = await new DeleteBoard(boards, scenes, storage).execute({
      userId: "owner",
      boardId: "b1",
    });
    expect(result.isOk()).toBe(true);
    expect(boards.rows.has("b1")).toBe(false);
    expect(scenes.discarded).toEqual(["b1"]);
    expect(deleted).toEqual(["boards/b1/"]);
  });

  it("uploads once per (board, file) and rejects bad types before touching storage", async () => {
    const { boards, files, storage, stored } = setup();
    const upload = new UploadBoardFile(boards, files, storage);
    const base = {
      userId: "owner",
      boardId: "b1",
      fileId: "f1",
      size: 3,
      read: async () => new Uint8Array(3),
    };
    expect(
      (await upload.execute({ ...base, mimeType: "text/plain" })).isErr()
    ).toBe(true);
    expect(stored).toEqual([]);
    await upload.execute({ ...base, mimeType: "image/png" });
    const again = await upload.execute({ ...base, mimeType: "image/png" });
    expect(again.isOk() && again.value).toEqual({
      id: "f1",
      mimeType: "image/png",
      size: 3,
    });
    expect(stored).toEqual(["boards/b1/f1"]);
  });
});

describe("scene editing", () => {
  it("adds, updates and tombstones elements with bumped versions", async () => {
    const { boards, scenes } = setup();
    const actor = { userId: "owner", boardId: "b1" };
    const added = await new AddBoardElements(boards, scenes, ids).execute({
      ...actor,
      shapes: [{ type: "text", x: 1, y: 2, text: "hi" }],
    });
    const id = added.isOk() ? added.value.ids[0]! : "";
    expect(scenes.elements.get(id)?.version).toBe(1);

    const update = new UpdateBoardElement(boards, scenes, ids);
    await update.execute({
      ...actor,
      id,
      patch: { text: "yo", x: 5, version: 99, id: "hijack" },
    });
    expect(scenes.elements.get(id)).toMatchObject({
      id,
      text: "yo",
      originalText: "yo",
      x: 5,
      version: 2,
    });

    const removed = await new DeleteBoardElements(boards, scenes, ids).execute({
      ...actor,
      ids: [id, "nope"],
    });
    expect(removed.isOk() && removed.value.deleted).toBe(1);
    expect(scenes.elements.get(id)).toMatchObject({
      isDeleted: true,
      version: 3,
    });
    expect(
      notFound(await update.execute({ ...actor, id, patch: { x: 1 } }))
    ).toBe(true);
  });
});
