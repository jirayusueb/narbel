import { describe, expect, it } from "bun:test";

import type { SceneElement } from "../../domain/entities/SceneElement";
import { AddBoardElements } from "./AddBoardElements";
import { DeleteBoardElements } from "./DeleteBoardElements";
import { ids, setupAccess } from "./fakes";
import { UpdateBoardElement } from "./UpdateBoardElement";

const owner = { userId: "owner" };

const setup = () => {
  const s = setupAccess();
  const add = new AddBoardElements(s.guard, s.scenes, ids);
  const update = new UpdateBoardElement(s.guard, s.scenes, ids);
  const remove = new DeleteBoardElements(s.guard, s.scenes, ids);
  const el = (id: string) =>
    s.scenes.elements.get(`page:main:${id}`) as SceneElement;
  const bound = (id: string) =>
    ((el(id).boundElements as { id: string }[] | null) ?? []).map((b) => b.id);
  const ends = (id: string) => ({
    start:
      (el(id).startBinding as { elementId: string } | null)?.elementId ?? null,
    end: (el(id).endBinding as { elementId: string } | null)?.elementId ?? null,
  });
  return { ...s, add, update, remove, el, bound, ends };
};

const boxes = [
  { id: "a", type: "rectangle" as const, x: 0, y: 0, width: 100, height: 100 },
  {
    id: "b",
    type: "rectangle" as const,
    x: 300,
    y: 0,
    width: 100,
    height: 100,
  },
];

describe("arrow connectors", () => {
  it("binds both ends in one batch and draws the arrow between the facing edges", async () => {
    const t = setup();
    const result = await t.add.execute({
      actor: owner,
      boardId: "b1",
      shapes: [
        ...boxes,
        {
          id: "ab",
          type: "arrow",
          x: 0,
          y: 0,
          startElementId: "a",
          endElementId: "b",
        },
      ],
    });
    expect(result.isOk()).toBe(true);
    expect(t.ends("ab")).toEqual({ start: "a", end: "b" });
    expect(t.bound("a")).toEqual(["ab"]);
    expect(t.bound("b")).toEqual(["ab"]);
    const arrow = t.el("ab");
    expect(Number(arrow.x)).toBeGreaterThanOrEqual(100);
    expect(Number(arrow.x) + Number(arrow.width)).toBeLessThanOrEqual(300);
    expect(arrow.points).toEqual([
      [0, 0],
      [Number(arrow.width), 0],
    ]);
  });

  it("binds to shapes created earlier, so browsers see the new binding on the old shape", async () => {
    const t = setup();
    await t.add.execute({ actor: owner, boardId: "b1", shapes: boxes });
    const before = t.el("a").version;
    await t.add.execute({
      actor: owner,
      boardId: "b1",
      shapes: [
        {
          id: "ab",
          type: "arrow",
          x: 0,
          y: 0,
          startElementId: "a",
          endElementId: "b",
        },
      ],
    });
    expect(t.bound("a")).toEqual(["ab"]);
    expect(t.el("a").version).toBeGreaterThan(before);
  });

  it("accepts an arrow listed before the shapes it connects", async () => {
    const t = setup();
    await t.add.execute({
      actor: owner,
      boardId: "b1",
      shapes: [
        {
          id: "ab",
          type: "arrow",
          x: 0,
          y: 0,
          startElementId: "a",
          endElementId: "b",
        },
        ...boxes,
      ],
    });
    expect(t.bound("a")).toEqual(["ab"]);
    expect(t.bound("b")).toEqual(["ab"]);
  });

  it("rejects bindings on non-connectors, unknown targets and reused ids, writing nothing", async () => {
    const t = setup();
    const notConnector = await t.add.execute({
      actor: owner,
      boardId: "b1",
      shapes: [...boxes, { type: "ellipse", x: 0, y: 0, startElementId: "a" }],
    });
    expect(notConnector.isErr()).toBe(true);
    const unknown = await t.add.execute({
      actor: owner,
      boardId: "b1",
      shapes: [{ type: "arrow", x: 0, y: 0, endElementId: "nope" }],
    });
    expect(unknown.isErr()).toBe(true);
    expect(t.scenes.elements.size).toBe(0);
    await t.add.execute({ actor: owner, boardId: "b1", shapes: boxes });
    const reused = await t.add.execute({
      actor: owner,
      boardId: "b1",
      shapes: [{ id: "a", type: "ellipse", x: 9, y: 9 }],
    });
    expect(reused.isErr()).toBe(true);
    expect(t.el("a").type).toBe("rectangle");
  });

  it("re-routes attached arrows when a bound shape moves", async () => {
    const t = setup();
    await t.add.execute({
      actor: owner,
      boardId: "b1",
      shapes: [
        ...boxes,
        {
          id: "ab",
          type: "arrow",
          x: 0,
          y: 0,
          startElementId: "a",
          endElementId: "b",
        },
      ],
    });
    await t.update.execute({
      actor: owner,
      boardId: "b1",
      id: "b",
      patch: { y: 400 },
    });
    const arrow = t.el("ab");
    const tipY = Number(arrow.y) + Number((arrow.points as number[][])[1]?.[1]);
    expect(tipY).toBeGreaterThan(300);
    expect(t.ends("ab")).toEqual({ start: "a", end: "b" });
  });

  it("rebinds an arrow end and the old target forgets it; null detaches", async () => {
    const t = setup();
    await t.add.execute({
      actor: owner,
      boardId: "b1",
      shapes: [
        ...boxes,
        { id: "c", type: "ellipse", x: 0, y: 300, width: 100, height: 100 },
        {
          id: "ab",
          type: "arrow",
          x: 0,
          y: 0,
          startElementId: "a",
          endElementId: "b",
        },
      ],
    });
    await t.update.execute({
      actor: owner,
      boardId: "b1",
      id: "ab",
      patch: {},
      rebind: { endElementId: "c" },
    });
    expect(t.ends("ab")).toEqual({ start: "a", end: "c" });
    expect(t.bound("b")).toEqual([]);
    expect(t.bound("c")).toEqual(["ab"]);
    await t.update.execute({
      actor: owner,
      boardId: "b1",
      id: "ab",
      patch: {},
      rebind: { startElementId: null },
    });
    expect(t.ends("ab")).toEqual({ start: null, end: "c" });
    expect(t.bound("a")).toEqual([]);
  });

  it("deleting a shape unbinds its arrows; deleting an arrow clears it from its shapes", async () => {
    const t = setup();
    await t.add.execute({
      actor: owner,
      boardId: "b1",
      shapes: [
        ...boxes,
        {
          id: "ab",
          type: "arrow",
          x: 0,
          y: 0,
          startElementId: "a",
          endElementId: "b",
        },
      ],
    });
    await t.remove.execute({ actor: owner, boardId: "b1", ids: ["b"] });
    expect(t.ends("ab")).toEqual({ start: "a", end: null });
    await t.remove.execute({ actor: owner, boardId: "b1", ids: ["ab"] });
    expect(t.bound("a")).toEqual([]);
  });
});
