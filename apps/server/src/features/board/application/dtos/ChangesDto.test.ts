import { describe, expect, it } from "bun:test";

import type { SceneElement } from "../../domain/entities/SceneElement";
import type { ElementTouch } from "../ports/IBoardScenes";
import { toPageChanges } from "./ChangesDto";

const el = (id: string, extra: Record<string, unknown> = {}): SceneElement => ({
  id,
  type: "rectangle",
  version: 1,
  versionNonce: 1,
  x: 0,
  y: 0,
  width: 10,
  height: 10,
  index: id,
  ...extra,
});

const sceneOf = (elements: SceneElement[], pageIds = ["p1"]) => ({
  pages: () => pageIds.map((id) => ({ id, name: `name ${id}` })),
  get: (pageId: string, id: string) =>
    pageId === "p1" ? elements.find((e) => e.id === id) : undefined,
});

const touch = (
  element: SceneElement,
  existedAtCursor: boolean,
  pageId = "p1"
): ElementTouch => ({ pageId, element, existedAtCursor });

describe("toPageChanges", () => {
  it("reports a touched label once, on its container, with the new text", () => {
    const label = el("l", {
      type: "text",
      text: "New label",
      containerId: "box",
    });
    const box = el("box", { boundElements: [{ id: "l", type: "text" }] });
    const { pages, omitted } = toPageChanges(
      [touch(label, true)],
      sceneOf([box, label]),
      100
    );
    expect(omitted).toBe(0);
    expect(pages).toHaveLength(1);
    expect(pages[0]?.updated).toEqual([
      expect.objectContaining({ id: "box", text: "New label" }),
    ]);
    expect(pages[0]?.added).toEqual([]);
    expect(pages[0]?.deleted).toEqual([]);
  });

  it("drops created-then-deleted and reports existed-then-deleted with its last text", () => {
    const ghost = el("ghost", { isDeleted: true });
    const gone = el("gone", {
      isDeleted: true,
      boundElements: [{ id: "gl", type: "text" }],
    });
    const goneLabel = el("gl", {
      type: "text",
      text: "Replica",
      containerId: "gone",
      isDeleted: true,
    });
    const { pages } = toPageChanges(
      [touch(ghost, false), touch(gone, true), touch(goneLabel, true)],
      sceneOf([ghost, gone, goneLabel]),
      100
    );
    expect(pages[0]?.deleted).toEqual([
      { id: "gone", type: "rectangle", text: "Replica" },
    ]);
    expect(pages[0]?.added).toEqual([]);
  });

  it("splits added and updated, keeping page order then z-order", () => {
    const { pages } = toPageChanges(
      [
        touch(el("b"), false, "p2"),
        touch(el("z"), true),
        touch(el("a"), false),
      ],
      {
        pages: () => [
          { id: "p1", name: "One" },
          { id: "p2", name: "Two" },
        ],
        get: sceneOf([]).get,
      },
      100
    );
    expect(pages.map((p) => p.pageId)).toEqual(["p1", "p2"]);
    expect(pages[0]?.added.map((e) => e.id)).toEqual(["a"]);
    expect(pages[0]?.updated.map((e) => e.id)).toEqual(["z"]);
    expect(pages[1]?.added.map((e) => e.id)).toEqual(["b"]);
  });

  it("keeps the first max changes and counts the rest, leaving out empty pages", () => {
    const touches = Array.from({ length: 5 }, (_, i) =>
      touch(el(`e${i}`), true, "p1")
    );
    const { pages, omitted } = toPageChanges(
      [...touches, touch(el("late"), true, "p2")],
      sceneOf([], ["p1", "p2"]),
      3
    );
    expect(omitted).toBe(3);
    expect(pages.map((p) => p.pageId)).toEqual(["p1"]);
    expect(pages[0]?.updated.map((e) => e.id)).toEqual(["e0", "e1", "e2"]);
  });

  it("ignores elements of pages that no longer exist", () => {
    const { pages, omitted } = toPageChanges(
      [touch(el("a"), true, "gone")],
      sceneOf([]),
      100
    );
    expect(pages).toEqual([]);
    expect(omitted).toBe(0);
  });
});
