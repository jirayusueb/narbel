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
  const add = new AddBoardElements(s.policy, s.scenes, ids);
  const update = new UpdateBoardElement(s.policy, s.scenes, ids);
  const remove = new DeleteBoardElements(s.policy, s.scenes, ids);
  const read = new GetBoardScene(s.policy, s.scenes);
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

  it("rejects text on lines and arrows with no position or ends, writing nothing", async () => {
    const t = setup();
    const labelled = await t.add.execute({
      actor: owner,
      boardId: "b1",
      shapes: [{ type: "line", x: 0, y: 0, text: "yes" }],
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

  it("sizes a shape and its label by fontSize; the shape itself carries no fontSize", async () => {
    const t = setup();
    await t.add.execute({
      actor: owner,
      boardId: "b1",
      shapes: [
        { id: "a", type: "rectangle", x: 0, y: 0, text: "Hello", fontSize: 28 },
        { id: "b", type: "rectangle", x: 0, y: 200, text: "Hello" },
      ],
    });
    expect(t.labelOf("a")?.fontSize).toBe(28);
    expect(Number(t.el("a").width)).toBeGreaterThan(Number(t.el("b").width));
    expect(t.el("a")).not.toHaveProperty("fontSize");
    const rows = await t.scene();
    expect(rows[0]).toMatchObject({ id: "a", text: "Hello", fontSize: 28 });
    expect(rows[1]).not.toHaveProperty("fontSize");
  });

  it("rejects a style field that does not apply to the type, naming field and type", async () => {
    const t = setup();
    const result = await t.add.execute({
      actor: owner,
      boardId: "b1",
      shapes: [{ type: "rectangle", x: 0, y: 0, endArrowhead: "bar" }],
    });
    expect(result.isErr() && result.error.message).toContain("endArrowhead");
    expect(result.isErr() && result.error.message).toContain("rectangle");
    expect(t.scenes.elements.size).toBe(0);
  });

  it("builds an arrow's label on its midpoint after the arrow is attached", async () => {
    const t = setup();
    await t.add.execute({
      actor: owner,
      boardId: "b1",
      shapes: [
        { id: "a", type: "rectangle", x: 0, y: 0, width: 100, height: 100 },
        { id: "b", type: "rectangle", x: 300, y: 200, width: 100, height: 100 },
        {
          id: "ab",
          type: "arrow",
          text: "HTTPS",
          startElementId: "a",
          endElementId: "b",
        },
      ],
    });
    const arrow = t.el("ab");
    const [, tip] = arrow.points as number[][];
    expect(t.center(t.labelOf("ab") as SceneElement)).toEqual({
      x: Number(arrow.x) + (tip?.[0] ?? 0) / 2,
      y: Number(arrow.y) + (tip?.[1] ?? 0) / 2,
    });
    expect((await t.scene()).find((e) => e.id === "ab")?.text).toBe("HTTPS");
  });
});

describe("frames", () => {
  it("wraps the children of a frame without geometry, writing the frame before them", async () => {
    const t = setup();
    const result = await t.add.execute({
      actor: owner,
      boardId: "b1",
      shapes: [
        { id: "f", type: "frame", name: "Auth" },
        { id: "a", type: "rectangle", frameId: "f", text: "Web" },
        { id: "b", type: "rectangle", frameId: "f", text: "API" },
        { type: "arrow", startElementId: "a", endElementId: "b", frameId: "f" },
      ],
    });
    expect(result.isOk()).toBe(true);
    const frame = t.el("f");
    expect(frame).toMatchObject({ type: "frame", name: "Auth" });
    for (const id of ["a", "b"]) {
      const child = t.el(id);
      expect(Number(child.x)).toBeGreaterThanOrEqual(Number(frame.x));
      expect(Number(child.y)).toBeGreaterThanOrEqual(Number(frame.y));
      expect(Number(child.x) + Number(child.width)).toBeLessThanOrEqual(
        Number(frame.x) + Number(frame.width)
      );
      expect(Number(child.y) + Number(child.height)).toBeLessThanOrEqual(
        Number(frame.y) + Number(frame.height)
      );
    }
    expect((t.labelOf("a") as SceneElement).frameId).toBe("f");
    expect([...t.scenes.elements.keys()][0]).toBe("page:main:f");
    const rows = await t.scene();
    expect(rows.find((e) => e.id === "a")).toMatchObject({ frameId: "f" });
    expect(rows.find((e) => e.id === "f")).toMatchObject({ name: "Auth" });
  });

  it("lays loose children out inside a sized frame", async () => {
    const t = setup();
    await t.add.execute({
      actor: owner,
      boardId: "b1",
      shapes: [
        {
          id: "f",
          type: "frame",
          x: 1000,
          y: 500,
          width: 600,
          height: 400,
        },
        { id: "a", type: "rectangle", frameId: "f", width: 100, height: 60 },
      ],
    });
    expect(t.el("a")).toMatchObject({ x: 1040, y: 540, frameId: "f" });
  });

  it("rejects an unknown frameId, partial frame geometry and an empty unsized frame", async () => {
    const t = setup();
    const outcomes = await Promise.all(
      [
        [{ type: "rectangle" as const, x: 0, y: 0, frameId: "nope" }],
        [{ type: "frame" as const, x: 0, y: 0 }],
        [{ type: "frame" as const }],
      ].map((shapes) => t.add.execute({ actor: owner, boardId: "b1", shapes }))
    );
    expect(outcomes.every((o) => o.isErr())).toBe(true);
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

  it("leaves room for an arrow's label between auto-placed shapes", async () => {
    const t = setup();
    await t.add.execute({
      actor: owner,
      boardId: "b1",
      direction: "right",
      shapes: [
        { id: "a", type: "rectangle", text: "A" },
        { id: "b", type: "rectangle", text: "B" },
        {
          id: "ab",
          type: "arrow",
          text: "submit the form",
          startElementId: "a",
          endElementId: "b",
        },
      ],
    });
    const arrow = t.el("ab");
    const [, tip] = arrow.points as number[][];
    const length = Math.hypot(tip?.[0] ?? 0, tip?.[1] ?? 0);
    expect(length).toBeGreaterThanOrEqual(
      Number(t.labelOf("ab")?.width) + 2 * 24
    );
  });

  it("refits and rewraps an arrow label when an end shape moves", async () => {
    const t = setup();
    const text =
      "alpha bravo charlie delta echo foxtrot golf hotel india juliet";
    await t.add.execute({
      actor: owner,
      boardId: "b1",
      shapes: [
        { id: "a", type: "rectangle", x: 0, y: 0, width: 100, height: 100 },
        { id: "b", type: "rectangle", x: 0, y: 300, width: 100, height: 100 },
        {
          id: "ab",
          type: "arrow",
          text,
          startElementId: "a",
          endElementId: "b",
        },
      ],
    });
    const before = t.labelOf("ab") as SceneElement;
    expect(String(before.text).split("\n").length).toBeGreaterThan(2);
    expect(before.originalText).toBe(text);
    await t.update.execute({
      actor: owner,
      boardId: "b1",
      id: "b",
      patch: { x: 2000 },
    });
    const after = t.labelOf("ab") as SceneElement;
    expect(String(after.text).split("\n").length).toBeLessThan(
      String(before.text).split("\n").length
    );
    expect(after.originalText).toBe(text);
  });

  it("reports an arrow label unwrapped and writes it back without line breaks", async () => {
    const t = setup();
    const text =
      "alpha bravo charlie delta echo foxtrot golf hotel india juliet";
    await t.add.execute({
      actor: owner,
      boardId: "b1",
      shapes: [
        { id: "a", type: "rectangle", x: 0, y: 0, width: 100, height: 100 },
        { id: "b", type: "rectangle", x: 0, y: 300, width: 100, height: 100 },
        {
          id: "ab",
          type: "arrow",
          text,
          startElementId: "a",
          endElementId: "b",
        },
      ],
    });
    expect(String((t.labelOf("ab") as SceneElement).text)).toContain("\n");
    const shown = (await t.scene()).find((e) => e.id === "ab")?.text;
    expect(shown).toBe(text);
    await t.update.execute({
      actor: owner,
      boardId: "b1",
      id: "ab",
      patch: { text: shown as string },
    });
    expect((t.labelOf("ab") as SceneElement).originalText).toBe(text);
  });

  it("leaves room for a labelled arrow that skips a rank", async () => {
    const t = setup();
    await t.add.execute({
      actor: owner,
      boardId: "b1",
      shapes: [
        { id: "a", type: "rectangle", text: "A" },
        { id: "b", type: "rectangle", text: "B" },
        { id: "c", type: "rectangle", text: "C" },
        { id: "ab", type: "arrow", startElementId: "a", endElementId: "b" },
        { id: "bc", type: "arrow", startElementId: "b", endElementId: "c" },
        {
          id: "ac",
          type: "arrow",
          text: "alpha bravo charlie delta echo foxtrot golf hotel india",
          startElementId: "a",
          endElementId: "c",
        },
      ],
    });
    const label = t.labelOf("ac") as SceneElement;
    const gap = (upper: string, lower: string) =>
      Number(t.el(lower).y) -
      (Number(t.el(upper).y) + Number(t.el(upper).height));
    expect(gap("a", "b")).toBeGreaterThanOrEqual(Number(label.height) + 48);
    expect(gap("b", "c")).toBeGreaterThanOrEqual(Number(label.height) + 48);
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
