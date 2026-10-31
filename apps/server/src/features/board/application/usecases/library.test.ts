import { describe, expect, it } from "bun:test";

import { MAX_LIBRARY_ITEMS } from "../../domain/rules/LibraryRules";
import type { ILibraryRepository } from "../ports/ILibraryRepository";
import { GetLibrary } from "./GetLibrary";
import { SaveLibrary } from "./SaveLibrary";

const setup = () => {
  const rows = new Map<string, unknown[]>();
  const repo: ILibraryRepository = {
    find: (userId) => Promise.resolve(rows.get(userId) ?? null),
    save: (userId, items) => {
      rows.set(userId, items);
      return Promise.resolve();
    },
  };
  return { get: new GetLibrary(repo), save: new SaveLibrary(repo) };
};

const item = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  status: "unpublished",
  created: 1,
  elements: [{ type: "rectangle", id: "e1", customField: { deep: [1, 2] } }],
  ...extra,
});

describe("library", () => {
  it("returns an empty library before the first save", async () => {
    const { get } = setup();
    const res = await get.execute({ userId: "a" });
    expect(res.isOk() && res.value.libraryItems).toEqual([]);
  });

  it("round-trips items without losing fields", async () => {
    const { get, save } = setup();
    const items = [item("i1", { name: "Arrow" })];
    expect(
      (await save.execute({ userId: "a", libraryItems: items })).isOk()
    ).toBe(true);
    const res = await get.execute({ userId: "a" });
    expect(res.isOk() && res.value.libraryItems).toEqual(items);
  });

  it("keeps libraries separate per account", async () => {
    const { get, save } = setup();
    await save.execute({ userId: "a", libraryItems: [item("mine")] });
    const res = await get.execute({ userId: "b" });
    expect(res.isOk() && res.value.libraryItems).toEqual([]);
    await save.execute({ userId: "b", libraryItems: [] });
    const a = await get.execute({ userId: "a" });
    expect(a.isOk() && a.value.libraryItems).toHaveLength(1);
  });

  it("rejects items without a usable id or elements array and stores nothing", async () => {
    const { get, save } = setup();
    const bad: unknown[][] = [
      [{ elements: [] }],
      [{ id: "", elements: [] }],
      [{ id: "x".repeat(129), elements: [] }],
      [{ id: "i1", elements: "nope" }],
      [item("dup"), item("dup")],
    ];
    for (const libraryItems of bad) {
      const res = await save.execute({ userId: "a", libraryItems });
      expect(res.isErr() && res.error.code).toBe("ValidationFailed");
    }
    const res = await get.execute({ userId: "a" });
    expect(res.isOk() && res.value.libraryItems).toEqual([]);
  });

  it("rejects more than the item cap", async () => {
    const { save } = setup();
    const libraryItems = Array.from({ length: MAX_LIBRARY_ITEMS + 1 }, (_, i) =>
      item(`i${i}`)
    );
    const res = await save.execute({ userId: "a", libraryItems });
    expect(res.isErr() && res.error.code).toBe("PayloadTooLarge");
  });
});
