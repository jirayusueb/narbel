import { describe, expect, it } from "bun:test";

import type { SceneElement } from "../../domain/entities/SceneElement";
import { AddBoardElements } from "./AddBoardElements";
import { DeleteBoardElements } from "./DeleteBoardElements";
import { ids, setupAccess } from "./fakes";
import { EditSelection } from "./Selection";
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

  it("reports a taken id before a connector end on a non-connector", async () => {
    const t = setup();
    await t.add.execute({ actor: owner, boardId: "b1", shapes: boxes });
    const result = await t.add.execute({
      actor: owner,
      boardId: "b1",
      shapes: [
        { id: "a", type: "ellipse", x: 9, y: 9 },
        { type: "ellipse", x: 0, y: 0, startElementId: "a" },
      ],
    });
    expect(result.isErr() && result.error.message).toContain("already exists");
  });

  it("reports a bad style before a connector end on a non-connector", async () => {
    const t = setup();
    const result = await t.add.execute({
      actor: owner,
      boardId: "b1",
      shapes: [
        { type: "ellipse", x: 0, y: 0, startElementId: "a" },
        { type: "rectangle", x: 0, y: 0, endArrowhead: "arrow" },
      ],
    });
    expect(result.isErr() && result.error.message).toContain("applies to");
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

  it("puts an arrow on the page of the elements it connects when pageId is omitted", async () => {
    const t = setup();
    t.scenes.pageList.push({ id: "page:two", name: "Page 2" });
    await t.add.execute({
      actor: owner,
      boardId: "b1",
      pageId: "page:two",
      shapes: boxes,
    });
    const result = await t.add.execute({
      actor: owner,
      boardId: "b1",
      shapes: [
        { id: "ab", type: "arrow", startElementId: "a", endElementId: "b" },
      ],
    });
    expect(result.isOk()).toBe(true);
    const arrow = t.scenes.elements.get("page:two:ab");
    expect(t.scenes.elements.has("page:main:ab")).toBe(false);
    expect(arrow?.startBinding).toMatchObject({ elementId: "a" });
    expect(arrow?.endBinding).toMatchObject({ elementId: "b" });
  });
});

describe("labels follow their container", () => {
  const labelOf = (t: { el: (id: string) => SceneElement }, id: string) => {
    const entry = (
      (t.el(id).boundElements as { id: string; type: string }[] | null) ?? []
    ).find((b) => b.type === "text");
    return entry && t.el(entry.id);
  };
  const middle = (arrow: SceneElement) => {
    const [, tip] = arrow.points as number[][];
    return {
      x: Number(arrow.x) + (tip?.[0] ?? 0) / 2,
      y: Number(arrow.y) + (tip?.[1] ?? 0) / 2,
    };
  };
  const centerOf = (e: SceneElement) => ({
    x: Number(e.x) + Number(e.width) / 2,
    y: Number(e.y) + Number(e.height) / 2,
  });
  const labelled = async () => {
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
          text: "go",
          startElementId: "a",
          endElementId: "b",
        },
      ],
    });
    return t;
  };

  it("re-centers an arrow's label when either end shape moves", async () => {
    const t = await labelled();
    const before = labelOf(t, "ab") as SceneElement;
    await t.update.execute({
      actor: owner,
      boardId: "b1",
      id: "b",
      patch: { y: 400 },
    });
    const label = labelOf(t, "ab") as SceneElement;
    expect(label.version).toBeGreaterThan(before.version);
    expect(centerOf(label)).toEqual(middle(t.el("ab")));
    expect(centerOf(label).y).toBeGreaterThan(centerOf(before).y);
  });

  it("refits the label when the arrow is rebound or moved itself", async () => {
    const t = await labelled();
    await t.update.execute({
      actor: owner,
      boardId: "b1",
      id: "ab",
      patch: {},
      rebind: { endElementId: "c" },
    });
    expect(centerOf(labelOf(t, "ab") as SceneElement)).toEqual(
      middle(t.el("ab"))
    );
    await t.update.execute({
      actor: owner,
      boardId: "b1",
      id: "ab",
      patch: { x: 5, y: 5 },
    });
    expect(centerOf(labelOf(t, "ab") as SceneElement)).toEqual(
      middle(t.el("ab"))
    );
  });

  it("routes fontSize to the label of a rectangle and refits it", async () => {
    const t = setup();
    await t.add.execute({
      actor: owner,
      boardId: "b1",
      shapes: [{ id: "a", type: "rectangle", x: 0, y: 0, text: "Hello" }],
    });
    const before = labelOf(t, "a") as SceneElement;
    await t.update.execute({
      actor: owner,
      boardId: "b1",
      id: "a",
      patch: { fontSize: 36, strokeWidth: 4 },
    });
    const label = labelOf(t, "a") as SceneElement;
    expect(label.fontSize).toBe(36);
    expect(Number(label.width)).toBeGreaterThan(Number(before.width));
    expect(label.version).toBeGreaterThan(before.version);
    expect(centerOf(label)).toEqual(centerOf(t.el("a")));
    expect(t.el("a")).toMatchObject({ strokeWidth: 4, version: 2 });
    expect(t.el("a")).not.toHaveProperty("fontSize");
  });

  it("re-measures a text element when its text or fontSize changes", async () => {
    const t = setup();
    await t.add.execute({
      actor: owner,
      boardId: "b1",
      shapes: [{ id: "t", type: "text", x: 0, y: 0, text: "ab" }],
    });
    await t.update.execute({
      actor: owner,
      boardId: "b1",
      id: "t",
      patch: { text: "abcd", fontSize: 40 },
    });
    expect(t.el("t")).toMatchObject({
      text: "abcd",
      originalText: "abcd",
      width: 96,
      height: 50,
    });
  });

  it("drops style fields that do not apply when updating, and edit_selection works on a mixed selection", async () => {
    const t = await labelled();
    const edit = new EditSelection(t.guard, t.scenes, ids);
    t.scenes.selection = ["a", "ab"];
    const result = await edit.execute({
      actor: owner,
      boardId: "b1",
      patch: { endArrowhead: null },
    });
    expect(result.isOk() && result.value.updated).toEqual(["a", "ab"]);
    expect(t.el("ab").endArrowhead).toBeNull();
    expect(t.el("a")).not.toHaveProperty("endArrowhead");
  });

  it("deleting an arrow tombstones its label and deleting a shape its own", async () => {
    const t = await labelled();
    const label = labelOf(t, "ab") as SceneElement;
    await t.remove.execute({ actor: owner, boardId: "b1", ids: ["ab"] });
    expect(t.el(label.id).isDeleted).toBe(true);
    expect(t.bound("a")).toEqual([]);
  });
});

describe("lock enforcement", () => {
  it("refuses every patch but {locked:false} and refuses delete until unlocked", async () => {
    const t = setup();
    await t.add.execute({
      actor: owner,
      boardId: "b1",
      shapes: [{ id: "a", type: "rectangle", x: 0, y: 0, text: "Hi" }],
    });
    const patch = (p: Record<string, unknown>) =>
      t.update.execute({ actor: owner, boardId: "b1", id: "a", patch: p });
    expect((await patch({ locked: true })).isOk()).toBe(true);
    expect((await patch({ x: 50 })).isErr()).toBe(true);
    expect((await patch({ locked: false, x: 50 })).isErr()).toBe(true);
    expect(t.el("a").x).toBe(0);
    const deleted = await t.remove.execute({
      actor: owner,
      boardId: "b1",
      ids: ["a"],
    });
    expect(deleted.isOk() && deleted.value).toEqual({
      deleted: 0,
      locked: ["a"],
    });
    expect(t.el("a").isDeleted).toBe(false);
    expect((await patch({ locked: false })).isOk()).toBe(true);
    expect((await patch({ x: 50 })).isOk()).toBe(true);
  });

  it("edit_selection skips locked elements and lists them", async () => {
    const t = setup();
    await t.add.execute({ actor: owner, boardId: "b1", shapes: boxes });
    await t.update.execute({
      actor: owner,
      boardId: "b1",
      id: "b",
      patch: { locked: true },
    });
    t.scenes.selection = ["a", "b"];
    const edit = new EditSelection(t.guard, t.scenes, ids);
    const result = await edit.execute({
      actor: owner,
      boardId: "b1",
      patch: { strokeColor: "#f00" },
    });
    expect(result.isOk() && result.value).toEqual({
      updated: ["a"],
      locked: ["b"],
    });
  });

  it("mirrors lock state onto labels", async () => {
    const t = setup();
    await t.add.execute({
      actor: owner,
      boardId: "b1",
      shapes: [{ id: "a", type: "rectangle", x: 0, y: 0, text: "Hi" }],
    });
    await t.update.execute({
      actor: owner,
      boardId: "b1",
      id: "a",
      patch: { locked: true },
    });
    const [entry] = t.el("a").boundElements as { id: string }[];
    expect(t.el(entry?.id ?? "").locked).toBe(true);
  });
});

describe("frame deletion", () => {
  it("releases the children with frameId null, as Excalidraw's delete action does", async () => {
    const t = setup();
    await t.add.execute({
      actor: owner,
      boardId: "b1",
      shapes: [
        { id: "f", type: "frame" },
        { id: "a", type: "rectangle", frameId: "f", text: "Hi" },
      ],
    });
    const [entry] = t.el("a").boundElements as { id: string }[];
    await t.remove.execute({ actor: owner, boardId: "b1", ids: ["f"] });
    expect(t.el("f").isDeleted).toBe(true);
    expect(t.el("a")).toMatchObject({ isDeleted: false, frameId: null });
    expect(t.el(entry?.id ?? "")).toMatchObject({
      isDeleted: false,
      frameId: null,
    });
  });
});

describe("versions", () => {
  it("every write to an existing element has a higher version", async () => {
    const t = setup();
    await t.add.execute({
      actor: owner,
      boardId: "b1",
      shapes: [
        ...boxes,
        {
          id: "ab",
          type: "arrow",
          text: "x",
          startElementId: "a",
          endElementId: "b",
        },
      ],
    });
    const before = new Map(
      [...t.scenes.elements].map(([key, e]) => [key, e.version])
    );
    await t.update.execute({
      actor: owner,
      boardId: "b1",
      id: "b",
      patch: { x: 500, fontSize: 30 },
    });
    const changed = [...t.scenes.elements].filter(
      ([key, e]) => e.version !== before.get(key)
    );
    expect(changed.length).toBeGreaterThanOrEqual(2);
    for (const [key, e] of changed) {
      expect(e.version).toBeGreaterThan(before.get(key) ?? 0);
    }
  });
});

describe("frame membership follows geometry", () => {
  const framed = async () => {
    const t = setup();
    await t.add.execute({
      actor: owner,
      boardId: "b1",
      shapes: [
        {
          id: "f",
          type: "frame",
          name: "F",
          x: 0,
          y: 0,
          width: 400,
          height: 300,
        },
        {
          id: "c",
          type: "rectangle",
          x: 50,
          y: 50,
          width: 100,
          height: 100,
          text: "C",
          frameId: "f",
        },
        { id: "o", type: "rectangle", x: 600, y: 50, width: 100, height: 100 },
        { id: "co", type: "arrow", startElementId: "c", endElementId: "o" },
      ],
    });
    return t;
  };
  const labelId = (t: { bound: (id: string) => string[] }, id: string) =>
    t.bound(id).find((b) => b.length > 0 && b !== "co") as string;

  it("moves the children with their frame and re-routes arrows bound to them", async () => {
    const t = await framed();
    await t.update.execute({
      actor: owner,
      boardId: "b1",
      id: "f",
      patch: { x: 1000, y: 100 },
    });
    expect(t.el("c")).toMatchObject({ x: 1050, y: 150, frameId: "f" });
    const label = t.el(labelId(t, "c"));
    expect(Number(label.x)).toBeGreaterThan(1000);
    expect(label.frameId).toBe("f");
    expect(t.el("o")).toMatchObject({ x: 600, y: 50 });
    expect(t.ends("co")).toEqual({ start: "c", end: "o" });
    expect(Number(t.el("co").x)).toBeGreaterThan(1000);
  });

  it("takes a child out of its frame once it lies completely outside, label included", async () => {
    const t = await framed();
    await t.update.execute({
      actor: owner,
      boardId: "b1",
      id: "c",
      patch: { x: 2000 },
    });
    expect(t.el("c").frameId).toBeNull();
    expect(t.el(labelId(t, "c")).frameId).toBeNull();
  });

  it("keeps a child that still overlaps its frame", async () => {
    const t = await framed();
    await t.update.execute({
      actor: owner,
      boardId: "b1",
      id: "c",
      patch: { x: 380 },
    });
    expect(t.el("c").frameId).toBe("f");
  });
});

describe("frames and connectors", () => {
  it("unbinds an arrow attached to a deleted frame", async () => {
    const t = setup();
    await t.add.execute({
      actor: owner,
      boardId: "b1",
      shapes: [
        { id: "f", type: "frame", x: 0, y: 0, width: 300, height: 200 },
        { id: "o", type: "rectangle", x: 600, y: 50, width: 100, height: 100 },
        { id: "fo", type: "arrow", startElementId: "f", endElementId: "o" },
      ],
    });
    expect(t.ends("fo").start).toBe("f");
    await t.remove.execute({ actor: owner, boardId: "b1", ids: ["f"] });
    expect(t.ends("fo")).toEqual({ start: null, end: "o" });
  });

  it("carries a locked child along when its frame moves", async () => {
    const t = setup();
    await t.add.execute({
      actor: owner,
      boardId: "b1",
      shapes: [
        { id: "f", type: "frame", x: 0, y: 0, width: 300, height: 200 },
        {
          id: "c",
          type: "rectangle",
          x: 50,
          y: 50,
          width: 100,
          height: 100,
          frameId: "f",
        },
      ],
    });
    await t.update.execute({
      actor: owner,
      boardId: "b1",
      id: "c",
      patch: { locked: true },
    });
    await t.update.execute({
      actor: owner,
      boardId: "b1",
      id: "f",
      patch: { x: 1000 },
    });
    expect(t.el("c")).toMatchObject({ x: 1050, frameId: "f", locked: true });
  });

  it("fits a frame without geometry before routing an arrow bound to it", async () => {
    const t = setup();
    await t.add.execute({
      actor: owner,
      boardId: "b1",
      shapes: [
        { id: "f", type: "frame" },
        {
          id: "c",
          type: "rectangle",
          x: 50,
          y: 50,
          width: 100,
          height: 100,
          frameId: "f",
        },
        { id: "o", type: "rectangle", x: 1000, y: 50, width: 100, height: 100 },
        { id: "fo", type: "arrow", startElementId: "f", endElementId: "o" },
      ],
    });
    expect(t.bound("f")).toEqual(["fo"]);
    const frame = t.el("f");
    expect(Number(t.el("fo").x)).toBeGreaterThanOrEqual(
      Number(frame.x) + Number(frame.width)
    );
  });
});

describe("add_elements and frame membership", () => {
  const frame = {
    id: "f",
    type: "frame" as const,
    x: 0,
    y: 0,
    width: 300,
    height: 200,
  };

  it("stores frameId null for a placed element that lies outside a sized frame", async () => {
    const t = setup();
    await t.add.execute({
      actor: owner,
      boardId: "b1",
      shapes: [
        frame,
        {
          id: "out",
          type: "rectangle",
          x: 2000,
          y: 2000,
          width: 50,
          height: 50,
          text: "o",
          frameId: "f",
        },
        {
          id: "in",
          type: "rectangle",
          x: 20,
          y: 20,
          width: 50,
          height: 50,
          frameId: "f",
        },
      ],
    });
    expect(t.el("out").frameId).toBeNull();
    expect(t.el(t.bound("out")[0] ?? "").frameId).toBeNull();
    expect(t.el("in").frameId).toBe("f");
  });

  it("finds the page of a frame the call only references by frameId", async () => {
    const t = setup();
    t.scenes.pageList.push({ id: "page:2", name: "Page 2" });
    await t.add.execute({
      actor: owner,
      boardId: "b1",
      pageId: "page:2",
      shapes: [frame],
    });
    const result = await t.add.execute({
      actor: owner,
      boardId: "b1",
      shapes: [
        {
          id: "c",
          type: "rectangle",
          x: 10,
          y: 10,
          width: 20,
          height: 20,
          frameId: "f",
        },
      ],
    });
    expect(result.isOk()).toBe(true);
    expect(t.scenes.elements.get("page:2:c")?.frameId).toBe("f");
  });
});
