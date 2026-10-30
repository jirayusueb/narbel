import { describe, expect, it } from "bun:test";

import type { SceneElement } from "../../domain/entities/SceneElement";
import { polylineMidpoint } from "../../domain/rules/geometry";
import { AddBoardElements } from "./AddBoardElements";
import { ArrangeElements } from "./ArrangeElements";
import { ids, setupAccess } from "./fakes";
import { GroupElements } from "./GroupElements";
import { UpdateBoardElement } from "./UpdateBoardElement";

const owner = { userId: "owner" };

const setup = async () => {
  const s = setupAccess();
  const add = new AddBoardElements(s.guard, s.scenes, ids);
  const update = new UpdateBoardElement(s.guard, s.scenes, ids);
  const arrange = new ArrangeElements(s.guard, s.scenes, ids);
  const group = new GroupElements(s.guard, s.scenes, ids);
  const el = (id: string) =>
    s.scenes.elements.get(`page:main:${id}`) as SceneElement;
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
    const mid = polylineMidpoint(t.el("ab"));
    const label = t.labelOf("ab") as SceneElement;
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

  it("resolves a label id to its shape and names unknown ids", async () => {
    const t = await setup();
    const labelId = (t.labelOf("b") as SceneElement).id;
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
