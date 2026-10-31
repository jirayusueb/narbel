import { describe, expect, it } from "bun:test";

import type { IFileStorage } from "../../../../shared/application/interfaces/IFileStorage";
import { MAX_FILE_BYTES } from "../../domain/rules/UploadRules";
import type { ExcalidrawElement } from "../dtos/ExcalidrawElement";
import type { IBoardFileRepository } from "../ports/IBoardFileRepository";
import type { IBoardScenes, SceneAccess } from "../ports/IBoardScenes";
import { DuplicateBoard } from "./DuplicateBoard";
import { FakeScenes, ids, setupAccess } from "./fakes";

const owner = { userId: "owner" };
const BYTES = Uint8Array.from([1, 2, 3, 4]);

const element = (id: string, extra: Record<string, unknown> = {}) =>
  ({
    id,
    type: "rectangle",
    version: 1,
    versionNonce: 7,
    index: "a0",
    ...extra,
  }) as ExcalidrawElement;

const setup = () => {
  const base = setupAccess();
  const stored = new Map<string, { bytes: Uint8Array; mimeType: string }>();
  const rows = new Map<
    string,
    { id: string; mimeType: string; size: number }
  >();
  const files: IBoardFileRepository = {
    findById: (b, f) => Promise.resolve(rows.get(`${b}/${f}`) ?? null),
    save: (b, f) => {
      rows.set(`${b}/${f.id}`, f);
      return Promise.resolve(true);
    },
  };
  let failStream = false;
  const deletedPrefixes: string[] = [];
  const storage: IFileStorage = {
    presignUpload: () => "",
    put: (key, bytes, mimeType) => {
      stored.set(key, { bytes, mimeType });
      return Promise.resolve();
    },
    stream: (key) => {
      if (failStream) {
        throw new Error("gone");
      }
      return new ReadableStream({
        start(c) {
          c.enqueue(stored.get(key)?.bytes);
          c.close();
        },
      });
    },
    stat: (key) => {
      const s = stored.get(key);
      return Promise.resolve(
        s ? { size: s.bytes.length, type: s.mimeType } : null
      );
    },
    delete: () => Promise.resolve(),
    deletePrefix: (prefix) => {
      deletedPrefixes.push(prefix);
      return Promise.resolve();
    },
  };
  const source = base.scenes;
  const copies = new Map<string, FakeScenes>();
  let failCopyWrite = false;
  const scenes: IBoardScenes = {
    transact: <T>(boardId: string, fn: (scene: SceneAccess) => T) => {
      if (boardId === "b1") {
        return source.transact(boardId, fn);
      }
      if (failCopyWrite) {
        return Promise.reject(new Error("boom"));
      }
      const copy = copies.get(boardId) ?? new FakeScenes();
      copies.set(boardId, copy);
      return copy.transact(boardId, fn);
    },
    getSelection: () => Promise.resolve([]),
    setSelection: () => Promise.resolve(),
    discard: (boardId) => source.discard(boardId),
    evict: () => Promise.resolve(),
  };
  source.pageList.push({ id: "page:two", name: "Second" });
  source.elements.set("page:main:box", element("box", { boundElements: [] }));
  source.elements.set(
    "page:main:arrow",
    element("arrow", {
      type: "arrow",
      startBinding: { elementId: "box", focus: 0, gap: 1 },
    })
  );
  source.elements.set("page:main:gone", element("gone", { isDeleted: true }));
  source.elements.set(
    "page:two:img",
    element("img", { type: "image", fileId: "file1", status: "saved" })
  );
  source.files.set("file1", {
    id: "file1",
    mimeType: "image/png",
    created: 1,
  });
  stored.set("boards/b1/file1", { bytes: BYTES, mimeType: "image/png" });
  rows.set("b1/file1", { id: "file1", mimeType: "image/png", size: 4 });
  return {
    ...base,
    stored,
    rows,
    deletedPrefixes,
    source,
    copies,
    failStream: () => {
      failStream = true;
    },
    failCopyWrite: () => {
      failCopyWrite = true;
    },
    duplicate: new DuplicateBoard(
      base.policy,
      base.boards,
      scenes,
      files,
      storage,
      ids
    ),
  };
};

describe("DuplicateBoard", () => {
  it("copies every page, live elements with bindings, and image bytes into a new private board", async () => {
    const t = setup();
    const before = structuredClone([...t.source.elements.entries()]);
    const result = await t.duplicate.execute({ actor: owner, boardId: "b1" });
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      return;
    }
    const board = result.value;
    expect(board).toMatchObject({
      title: "Mine (copy)",
      visibility: "private",
      role: "owner",
    });
    expect(board.id).not.toBe("b1");
    expect(t.boards.rows.get(board.id)?.ownerId).toBe("owner");
    const copy = t.copies.get(board.id);
    expect(copy?.pageList).toEqual([
      { id: "page:main", name: "Page 1" },
      { id: "page:two", name: "Second" },
    ]);
    expect([...(copy?.elements.keys() ?? [])].toSorted()).toEqual([
      "page:main:arrow",
      "page:main:box",
      "page:two:img",
    ]);
    expect(copy?.elements.get("page:main:arrow")?.startBinding).toEqual({
      elementId: "box",
      focus: 0,
      gap: 1,
    });
    expect(copy?.files.get("file1")?.mimeType).toBe("image/png");
    expect(t.stored.get(`boards/${board.id}/file1`)?.bytes).toEqual(BYTES);
    expect(t.rows.get(`${board.id}/file1`)).toEqual({
      id: "file1",
      mimeType: "image/png",
      size: 4,
    });
    expect(t.stored.get("boards/b1/file1")?.bytes).toEqual(BYTES);
    expect([...t.source.elements.entries()]).toEqual(before);
    expect(t.source.pageList).toHaveLength(2);
  });

  it("refuses when a referenced image is missing and creates nothing", async () => {
    const t = setup();
    t.stored.delete("boards/b1/file1");
    const result = await t.duplicate.execute({ actor: owner, boardId: "b1" });
    expect(result.isErr() && result.error.code).toBe("Conflict");
    expect([...t.boards.rows.keys()]).toEqual(["b1"]);
    expect(t.copies.size).toBe(0);
    expect([...t.rows.keys()]).toEqual(["b1/file1"]);
  });

  it("refuses when a referenced image has no row", async () => {
    const t = setup();
    t.rows.delete("b1/file1");
    const result = await t.duplicate.execute({ actor: owner, boardId: "b1" });
    expect(result.isErr() && result.error.code).toBe("Conflict");
    expect([...t.boards.rows.keys()]).toEqual(["b1"]);
    expect([...t.stored.keys()]).toEqual(["boards/b1/file1"]);
  });

  it("refuses an image over the size limit", async () => {
    const t = setup();
    t.stored.set("boards/b1/file1", {
      bytes: new Uint8Array(MAX_FILE_BYTES + 1),
      mimeType: "image/png",
    });
    const result = await t.duplicate.execute({ actor: owner, boardId: "b1" });
    expect(result.isErr() && result.error.code).toBe("PayloadTooLarge");
    expect([...t.boards.rows.keys()]).toEqual(["b1"]);
  });

  it("refuses a board whose images together exceed the copy budget and creates nothing", async () => {
    const t = setup();
    const bytes = new Uint8Array(MAX_FILE_BYTES);
    // 26 x MAX_FILE_BYTES is over 256 MiB while every image is individually allowed
    for (let i = 0; i < 26; i += 1) {
      const fileId = `big${i}`;
      t.source.elements.set(
        `page:main:${fileId}`,
        element(fileId, { type: "image", fileId, status: "saved" })
      );
      t.stored.set(`boards/b1/${fileId}`, { bytes, mimeType: "image/png" });
      t.rows.set(`b1/${fileId}`, {
        id: fileId,
        mimeType: "image/png",
        size: bytes.length,
      });
    }
    const result = await t.duplicate.execute({ actor: owner, boardId: "b1" });
    expect(result.isErr() && result.error.code).toBe("PayloadTooLarge");
    expect([...t.boards.rows.keys()]).toEqual(["b1"]);
    expect(t.copies.size).toBe(0);
    expect(t.stored.size).toBe(27);
  });

  it("rolls the new board back when an image vanishes mid-copy", async () => {
    const t = setup();
    t.failStream();
    await expect(
      t.duplicate.execute({ actor: owner, boardId: "b1" })
    ).rejects.toThrow("gone");
    expect([...t.boards.rows.keys()]).toEqual(["b1"]);
    expect(t.deletedPrefixes).toHaveLength(1);
    expect(t.stored.get("boards/b1/file1")?.bytes).toEqual(BYTES);
  });

  it("refuses a caller who cannot read the source and writes nothing", async () => {
    const t = setup();
    const result = await t.duplicate.execute({
      actor: { userId: "stranger" },
      boardId: "b1",
    });
    expect(result.isErr()).toBe(true);
    expect([...t.boards.rows.keys()]).toEqual(["b1"]);
    expect([...t.stored.keys()]).toEqual(["boards/b1/file1"]);
  });

  it("refuses an anonymous caller even when the board is readable", async () => {
    const t = setup();
    const result = await t.duplicate.execute({ actor: {}, boardId: "b1" });
    expect(result.isErr()).toBe(true);
    expect([...t.boards.rows.keys()]).toEqual(["b1"]);
  });

  it("removes the half-built copy when the write fails", async () => {
    const t = setup();
    t.failCopyWrite();
    await expect(
      t.duplicate.execute({ actor: owner, boardId: "b1" })
    ).rejects.toThrow("boom");
    expect([...t.boards.rows.keys()]).toEqual(["b1"]);
    expect(t.deletedPrefixes).toHaveLength(1);
    expect(t.deletedPrefixes[0]).not.toBe("boards/b1/");
  });
});
