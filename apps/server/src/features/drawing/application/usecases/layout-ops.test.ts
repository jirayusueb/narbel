import { describe, expect, it } from "bun:test";

import { ids, setupAccess } from "../../../boards/application/usecases/fakes";
import { polylineMidpoint } from "../../domain/rules/geometry";
import { toElement } from "../dtos/ExcalidrawElement";
import type { ExcalidrawElement } from "../dtos/ExcalidrawElement";
import { AddBoardElements } from "./AddBoardElements";
import { ArrangeElements } from "./ArrangeElements";
import { FakeScenes } from "./fakes";
import { GroupElements } from "./GroupElements";
import { UpdateBoardElement } from "./UpdateBoardElement";

const owner = { userId: "owner" };

const setup = async () => {
  const s = { ...setupAccess(), scenes: new FakeScenes() };
  const add = new AddBoardElements(s.policy, s.scenes, ids);
  const update = new UpdateBoardElement(s.policy, s.scenes, ids);
  const arrange = new ArrangeElements(s.policy, s.scenes, ids);
  const group = new GroupElements(s.policy, s.scenes, ids);
  const el = (id: string) =>
    s.scenes.elements.get(`page:main:${id}`) as ExcalidrawElement;
  const labelOf = (id: string) => {
    const entry = (
      (el(id).boundElements as { id: string; type: string }[] | null) ?? []
    ).find((b) => b.type === "text");
    return entry && el(entry.id);
  };
  await add.execute({
    actor: owner,
    boardId: "b1",
    shapes: [
      {
        id: "a",
        type: "rectangle",
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        text: "A",
      },
      {
        id: "b",
        type: "rectangle",
        x: 300,
        y: 50,
        width: 100,
        height: 60,
        text: "B",
      },
      { id: "c", type: "rectangle", x: 600, y: 200, width: 100, height: 100 },
      {
        id: "ab",
        type: "arrow",
        x: 0,
        y: 0,
        startElementId: "a",
        endElementId: "b",
        text: "go",
      },
    ],
  });
  return { ...s, update, arrange, group, el, labelOf };
};

const align = (edge: "top" | "middle") => ({ kind: "align" as const, edge });

describe("align_elements", () => {
  it("moves shapes, re-routes the attached arrow and keeps its label at the midpoint", async () => {
    const t = await setup();
    const before = t.el("ab");
    const result = await t.arrange.execute({
      actor: owner,
      boardId: "b1",
      ids: ["a", "b", "ab"],
      how: align("middle"),
    });
    expect(result.isOk() && result.value).toEqual({
      moved: ["a", "b"],
      skipped: [{ id: "ab", reason: "connector" }],
    });
    expect(t.el("a").y).toBe(5);
    expect(t.el("b").y).toBe(25);
    expect(Number(t.el("ab").version)).toBeGreaterThan(Number(before.version));
    const mid = polylineMidpoint(toElement(t.el("ab")));
    const label = t.labelOf("ab") as ExcalidrawElement;
    expect(Number(label.x) + Number(label.width) / 2).toBeCloseTo(mid.x);
    expect(Number(label.y) + Number(label.height) / 2).toBeCloseTo(mid.y);
  });

  it("writes nothing on a second run", async () => {
    const t = await setup();
    const input = {
      actor: owner,
      boardId: "b1",
      ids: ["a", "b"],
      how: align("top"),
    };
    await t.arrange.execute(input);
    const versions = ["a", "b"].map((id) => t.el(id).version);
    const again = await t.arrange.execute(input);
    expect(again.isOk() && again.value.moved).toEqual([]);
    expect(["a", "b"].map((id) => t.el(id).version)).toEqual(versions);
  });

  it("skips locked elements and reports them", async () => {
    const t = await setup();
    await t.update.execute({
      actor: owner,
      boardId: "b1",
      id: "c",
      patch: { locked: true },
    });
    const result = await t.arrange.execute({
      actor: owner,
      boardId: "b1",
      ids: ["a", "b", "c"],
      how: align("top"),
    });
    expect(result.isOk() && result.value).toEqual({
      moved: ["b"],
      skipped: [{ id: "c", reason: "locked" }],
    });
    expect(t.el("c").y).toBe(200);
  });

  it("moves a group rigidly against an outside shape", async () => {
    const t = await setup();
    await t.group.group({ actor: owner, boardId: "b1", ids: ["a", "b"] });
    const result = await t.arrange.execute({
      actor: owner,
      boardId: "b1",
      ids: ["a", "b", "c"],
      how: { kind: "align", edge: "bottom" },
    });
    expect(result.isOk() && result.value.moved.sort()).toEqual(["a", "b"]);
    expect([t.el("a").y, t.el("b").y, t.el("c").y]).toEqual([190, 240, 200]);
    expect(t.el("b").x).toBe(300);
  });

  it("skips a whole group when one member is locked", async () => {
    const t = await setup();
    await t.group.group({ actor: owner, boardId: "b1", ids: ["a", "b"] });
    await t.update.execute({
      actor: owner,
      boardId: "b1",
      id: "b",
      patch: { locked: true },
    });
    const result = await t.arrange.execute({
      actor: owner,
      boardId: "b1",
      ids: ["a", "b", "c"],
      how: { kind: "align", edge: "bottom" },
    });
    expect(result.isOk() && result.value.moved).toEqual([]);
    expect(result.isOk() && result.value.skipped).toEqual([
      { id: "a", reason: "locked" },
      { id: "b", reason: "locked" },
    ]);
    expect(t.el("a").y).toBe(0);
  });

  it("distributes a group as one item", async () => {
    const t = await setup();
    await new AddBoardElements(t.policy, t.scenes, ids).execute({
      actor: owner,
      boardId: "b1",
      shapes: [
        { id: "d", type: "rectangle", x: 1000, y: 0, width: 100, height: 100 },
      ],
    });
    await t.group.group({ actor: owner, boardId: "b1", ids: ["a", "b"] });
    const result = await t.arrange.execute({
      actor: owner,
      boardId: "b1",
      ids: ["a", "b", "c", "d"],
      how: { kind: "distribute", axis: "horizontal" },
    });
    expect(result.isOk() && result.value.moved).toEqual(["c"]);
    expect([t.el("a").x, t.el("b").x, t.el("c").x, t.el("d").x]).toEqual([
      0, 300, 650, 1000,
    ]);
  });

  it("aligns 300 elements in one call and a rerun moves nothing", async () => {
    const t = await setup();
    const many = Array.from({ length: 300 }, (_, i) => ({
      id: `m${i}`,
      type: "rectangle" as const,
      x: i * 10,
      y: 1000 + i,
      width: 5,
      height: 5,
    }));
    await new AddBoardElements(t.policy, t.scenes, ids).execute({
      actor: owner,
      boardId: "b1",
      shapes: many,
    });
    const input = {
      actor: owner,
      boardId: "b1",
      ids: many.map((m) => m.id),
      how: align("top"),
    };
    const first = await t.arrange.execute(input);
    expect(first.isOk() && first.value.moved).toHaveLength(299);
    expect(many.every((m) => t.el(m.id).y === 1000)).toBe(true);
    const again = await t.arrange.execute(input);
    expect(again.isOk() && again.value.moved).toEqual([]);
  });

  it("resolves a label id to its shape and names unknown ids", async () => {
    const t = await setup();
    const labelId = (t.labelOf("b") as ExcalidrawElement).id;
    const ok = await t.arrange.execute({
      actor: owner,
      boardId: "b1",
      ids: ["a", labelId],
      how: align("top"),
    });
    expect(ok.isOk() && ok.value.moved).toEqual(["b"]);
    const bad = await t.arrange.execute({
      actor: owner,
      boardId: "b1",
      ids: ["a", "nope", "nada"],
      how: align("top"),
    });
    expect(bad.isErr() && bad.error.code).toBe("NotFound");
    expect(bad.isErr() && bad.error.message).toContain("nope, nada");
  });
});

describe("group_elements", () => {
  it("writes the group on members and their labels, bumps versions, and regrouping is idempotent", async () => {
    const t = await setup();
    const v = Number(t.el("a").version);
    const grouped = await t.group.group({
      actor: owner,
      boardId: "b1",
      ids: ["a", "b"],
    });
    const groupId = grouped.isOk() ? grouped.value.groupId : "";
    expect(groupId).not.toBe("");
    for (const e of [t.el("a"), t.el("b"), t.labelOf("a"), t.labelOf("b")]) {
      expect(e?.groupIds).toEqual([groupId]);
    }
    expect(Number(t.el("a").version)).toBeGreaterThan(v);
    const again = await t.group.group({
      actor: owner,
      boardId: "b1",
      ids: ["b", "a"],
    });
    expect(again.isOk() && again.value.groupId).toBe(groupId);
    expect(t.el("a").groupIds).toEqual([groupId]);
  });

  it("ungroups every holder of the outermost group, labels included", async () => {
    const t = await setup();
    const grouped = await t.group.group({
      actor: owner,
      boardId: "b1",
      ids: ["a", "b"],
    });
    const groupId = grouped.isOk() ? grouped.value.groupId : "";
    const result = await t.group.ungroup({
      actor: owner,
      boardId: "b1",
      ids: ["a"],
    });
    expect(result.isOk() && result.value.groupIds).toEqual([groupId]);
    for (const e of [t.el("a"), t.el("b"), t.labelOf("a"), t.labelOf("b")]) {
      expect(e?.groupIds).toEqual([]);
    }
  });
});

describe("align_elements and frames", () => {
  it("takes a framed shape out of its frame when it is aligned completely outside", async () => {
    const s = { ...setupAccess(), scenes: new FakeScenes() };
    await new AddBoardElements(s.policy, s.scenes, ids).execute({
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
          frameId: "f",
        },
        {
          id: "far",
          type: "rectangle",
          x: 0,
          y: 2000,
          width: 100,
          height: 100,
        },
      ],
    });
    await new ArrangeElements(s.policy, s.scenes, ids).execute({
      actor: owner,
      boardId: "b1",
      ids: ["c", "far"],
      how: { kind: "align", edge: "bottom" },
    });
    const c = s.scenes.elements.get("page:main:c") as ExcalidrawElement;
    expect(c.y).toBe(2000);
    expect(c.frameId).toBeNull();
  });
});

describe("group_elements nesting", () => {
  it("expands the operands to every holder of their outermost group", async () => {
    const t = await setup();
    const first = await t.group.group({
      actor: owner,
      boardId: "b1",
      ids: ["a", "b"],
    });
    const inner = first.isOk() ? first.value.groupId : "";
    const second = await t.group.group({
      actor: owner,
      boardId: "b1",
      ids: ["a", "c"],
    });
    const outer = second.isOk() ? second.value.groupId : "";
    expect(outer).not.toBe(inner);
    expect(second.isOk() && second.value.ids.toSorted()).toEqual([
      "a",
      "b",
      "c",
    ]);
    for (const e of [t.el("a"), t.el("b"), t.labelOf("a"), t.labelOf("b")]) {
      expect(e?.groupIds).toEqual([inner, outer]);
    }
    expect(t.el("c").groupIds).toEqual([outer]);
  });
});

describe("align_elements with a frame and its children", () => {
  it("moves the frame's children once, through the frame, and settles", async () => {
    const s = { ...setupAccess(), scenes: new FakeScenes() };
    await new AddBoardElements(s.policy, s.scenes, ids).execute({
      actor: owner,
      boardId: "b1",
      shapes: [
        {
          id: "f",
          type: "frame",
          x: 100,
          y: 0,
          width: 400,
          height: 300,
        },
        {
          id: "c",
          type: "rectangle",
          x: 150,
          y: 50,
          width: 100,
          height: 100,
          frameId: "f",
        },
        {
          id: "far",
          type: "rectangle",
          x: 1000,
          y: 0,
          width: 100,
          height: 100,
        },
      ],
    });
    const arrange = new ArrangeElements(s.policy, s.scenes, ids);
    const input = {
      actor: owner,
      boardId: "b1",
      ids: ["c", "f", "far"],
      how: { kind: "align" as const, edge: "right" as const },
    };
    await arrange.execute(input);
    const el = (id: string) =>
      s.scenes.elements.get(`page:main:${id}`) as ExcalidrawElement;
    expect(el("f").x).toBe(700);
    expect(el("c").x).toBe(750);
    const again = await arrange.execute(input);
    expect(again.isOk() && again.value.moved).toEqual([]);
  });
});

describe("align_elements with a frame child pulled in by a group", () => {
  const frameWithChild = async (grouped: string[], farX: number) => {
    const s = { ...setupAccess(), scenes: new FakeScenes() };
    await new AddBoardElements(s.policy, s.scenes, ids).execute({
      actor: owner,
      boardId: "b1",
      shapes: [
        { id: "f", type: "frame", x: 100, y: 0, width: 400, height: 300 },
        {
          id: "c",
          type: "rectangle",
          x: 150,
          y: 50,
          width: 100,
          height: 100,
          frameId: "f",
        },
        {
          id: "far",
          type: "rectangle",
          x: farX,
          y: 0,
          width: 100,
          height: 100,
        },
      ],
    });
    await new GroupElements(s.policy, s.scenes, ids).group({
      actor: owner,
      boardId: "b1",
      ids: grouped,
    });
    const el = (id: string) =>
      s.scenes.elements.get(`page:main:${id}`) as ExcalidrawElement;
    const alignOn = (named: string[], edge: "left" | "right") =>
      new ArrangeElements(s.policy, s.scenes, ids).execute({
        actor: owner,
        boardId: "b1",
        ids: named,
        how: { kind: "align", edge },
      });
    return { el, alignOn };
  };

  it("moves a named child once when it is grouped with its frame", async () => {
    const t = await frameWithChild(["f", "c"], 450);
    await t.alignOn(["c", "far"], "right");
    expect(Number(t.el("c").x) - Number(t.el("f").x)).toBe(50);
  });

  it("keeps a child inside its frame when a group mate pulls it in", async () => {
    const t = await frameWithChild(["c", "far"], 1000);
    await t.alignOn(["f", "far"], "left");
    expect(t.el("f").x).toBe(100);
    expect(t.el("c").x).toBe(150);
  });
});
