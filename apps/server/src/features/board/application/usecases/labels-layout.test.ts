import { describe, expect, it } from "bun:test";

import type { SceneElement } from "../../domain/entities/SceneElement";
import { AddBoardElements } from "./AddBoardElements";
import { DeleteBoardElements } from "./DeleteBoardElements";
import { ids, setupAccess } from "./fakes";
import { GetBoardScene } from "./GetBoardScene";
import { UpdateBoardElement } from "./UpdateBoardElement";

const owner = { userId: "owner" };

const setup = () => {
  const s = setupAccess();
  const add = new AddBoardElements(s.guard, s.scenes, ids);
  const update = new UpdateBoardElement(s.guard, s.scenes, ids);
  const remove = new DeleteBoardElements(s.guard, s.scenes, ids);
  const read = new GetBoardScene(s.guard, s.scenes);
  const el = (id: string) =>
    s.scenes.elements.get(`page:main:${id}`) as SceneElement;
  const labelOf = (id: string) => {
    const entry = (
      (el(id).boundElements as { id: string; type: string }[] | null) ?? []
    ).find((b) => b.type === "text");
    return entry && el(entry.id);
  };
  const scene = async () => {
    const result = await read.execute({ actor: owner, boardId: "b1" });
    return result.isOk() ? result.value.elements : [];
  };
  const center = (e: SceneElement) => ({
    x: Number(e.x) + Number(e.width) / 2,
    y: Number(e.y) + Number(e.height) / 2,
  });
  return { ...s, add, update, remove, el, labelOf, scene, center };
};

describe("shape labels", () => {
  it("binds the text of a rectangle as a centered label and reads it back as the shape's text", async () => {
    const t = setup();
    await t.add.execute({
      actor: owner,
      boardId: "b1",
      shapes: [{ id: "a", type: "rectangle", x: 0, y: 0, text: "Sign in" }],
    });
    const label = t.labelOf("a");
    expect(label).toMatchObject({
      type: "text",
      text: "Sign in",
      containerId: "a",
    });
    expect(t.center(label as SceneElement)).toEqual(t.center(t.el("a")));
    expect(await t.scene()).toEqual([
      {
        id: "a",
        type: "rectangle",
        x: 0,
        y: 0,
        width: 124,
        height: 65,
        text: "Sign in",
      },
    ]);
  });

  it("re-centers the label when its shape moves, edits it, and removes it on empty text", async () => {
    const t = setup();
    await t.add.execute({
      actor: owner,
      boardId: "b1",
      shapes: [{ id: "a", type: "ellipse", x: 0, y: 0, text: "A" }],
    });
    await t.update.execute({
      actor: owner,
      boardId: "b1",
      id: "a",
      patch: { x: 500, y: 200, text: "Moved" },
    });
    const label = t.labelOf("a") as SceneElement;
    expect(label.text).toBe("Moved");
    expect(t.center(label)).toEqual(t.center(t.el("a")));
    expect(t.el("a").text).toBeUndefined();

    await t.update.execute({
      actor: owner,
      boardId: "b1",
      id: "a",
      patch: { text: "" },
    });
    expect(t.labelOf("a")).toBeUndefined();
    expect(t.el(label.id).isDeleted).toBe(true);
  });

  it("adds a label to a shape that had none", async () => {
    const t = setup();
    await t.add.execute({
      actor: owner,
      boardId: "b1",
      shapes: [{ id: "a", type: "diamond", x: 0, y: 0 }],
    });
    await t.update.execute({
      actor: owner,
      boardId: "b1",
      id: "a",
      patch: { text: "Ok?" },
    });
    expect(t.labelOf("a")).toMatchObject({ text: "Ok?", containerId: "a" });
  });

  it("deletes the label with its shape", async () => {
    const t = setup();
    await t.add.execute({
      actor: owner,
      boardId: "b1",
      shapes: [{ id: "a", type: "rectangle", x: 0, y: 0, text: "Gone" }],
    });
    const label = t.labelOf("a") as SceneElement;
    await t.remove.execute({ actor: owner, boardId: "b1", ids: ["a"] });
    expect(t.el(label.id).isDeleted).toBe(true);
    expect(await t.scene()).toEqual([]);
  });

  it("rejects text on arrows and arrows with no position or ends, writing nothing", async () => {
    const t = setup();
    const labelled = await t.add.execute({
      actor: owner,
      boardId: "b1",
      shapes: [{ type: "arrow", x: 0, y: 0, text: "yes" }],
    });
    const floating = await t.add.execute({
      actor: owner,
      boardId: "b1",
      shapes: [
        { id: "a", type: "rectangle", x: 0, y: 0 },
        { type: "arrow", startElementId: "a" },
      ],
    });
    expect(labelled.isErr() && floating.isErr()).toBe(true);
    expect(t.scenes.elements.size).toBe(0);
  });
});

describe("automatic layout", () => {
  it("stacks a flow downward without overlaps, to the right of existing content", async () => {
    const t = setup();
    await t.add.execute({
      actor: owner,
      boardId: "b1",
      shapes: [
        { id: "old", type: "rectangle", x: 0, y: 50, width: 400, height: 100 },
      ],
    });
    await t.add.execute({
      actor: owner,
      boardId: "b1",
      shapes: [
        { id: "a", type: "rectangle", text: "Start" },
        { id: "b", type: "diamond", text: "Valid?" },
        { id: "c", type: "rectangle", text: "Save" },
        { id: "d", type: "rectangle", text: "Reject" },
        { type: "arrow", startElementId: "a", endElementId: "b" },
        { type: "arrow", startElementId: "b", endElementId: "c" },
        { type: "arrow", startElementId: "b", endElementId: "d" },
      ],
    });
    const [a, b, c, d] = [t.el("a"), t.el("b"), t.el("c"), t.el("d")];
    const bottom = (e: SceneElement) => Number(e.y) + Number(e.height);
    expect(Number(b.y)).toBeGreaterThan(bottom(a));
    expect(Number(c.y)).toBeGreaterThan(bottom(b));
    expect(c.y).toBe(d.y);
    expect(Number(c.x) + Number(c.width)).toBeLessThan(Number(d.x));
    for (const e of [a, b, c, d]) {
      expect(Number(e.x)).toBeGreaterThan(400);
      expect(Number(e.y)).toBeGreaterThanOrEqual(50);
    }
    expect(t.center(t.labelOf("b") as SceneElement)).toEqual(t.center(b));
  });

  it("lays out a cycle in finite ranks", async () => {
    const t = setup();
    const result = await t.add.execute({
      actor: owner,
      boardId: "b1",
      direction: "right",
      shapes: [
        { id: "a", type: "rectangle" },
        { id: "b", type: "rectangle" },
        { type: "arrow", startElementId: "a", endElementId: "b" },
        { type: "arrow", startElementId: "b", endElementId: "a" },
      ],
    });
    expect(result.isOk()).toBe(true);
    expect(Number(t.el("b").x)).toBeGreaterThan(Number(t.el("a").x) + 100);
    expect(t.el("b").y).toBe(t.el("a").y);
  });
});
