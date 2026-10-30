import { describe, expect, it } from "bun:test";

import { AddBoardElements } from "./AddBoardElements";
import { ids, setupAccess } from "./fakes";
import { GetBoardScene } from "./GetBoardScene";

const owner = { userId: "owner" };

const setup = async () => {
  const s = setupAccess();
  await new AddBoardElements(s.guard, s.scenes, ids).execute({
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
      { id: "b", type: "ellipse", x: 1000, y: 0, width: 100, height: 100 },
      { id: "c", type: "text", x: 2000, y: 0, text: "far" },
      // runs from b leftward to a: its x/y/width/height box lies right of what is drawn
      { id: "ba", type: "arrow", startElementId: "b", endElementId: "a" },
    ],
  });
  const read = new GetBoardScene(s.guard, s.scenes);
  return (filter: Record<string, unknown> = {}) =>
    read.execute({ actor: owner, boardId: "b1", ...filter });
};

describe("get_board filters", () => {
  it("reports total and keeps container labels when filtering", async () => {
    const get = await setup();
    const result = await get({ types: ["rectangle"] });
    expect(result.isOk() && result.value.total).toBe(4);
    expect(result.isOk() && result.value.truncated).toBe(false);
    expect(result.isOk() && result.value.elements).toMatchObject([
      { id: "a", type: "rectangle", text: "A" },
    ]);
  });

  it("keeps elements overlapping the box by their drawn bounds", async () => {
    const get = await setup();
    const result = await get({
      within: { x: 900, y: 40, width: 50, height: 20 },
    });
    expect(result.isOk() && result.value.elements.map((e) => e.id)).toEqual([
      "ba",
    ]);
  });

  it("matches a leftward arrow by its points, not by its box", async () => {
    const get = await setup();
    const result = await get({
      types: ["arrow"],
      within: { x: 200, y: 40, width: 10, height: 20 },
    });
    expect(result.isOk() && result.value.elements).toHaveLength(1);
  });

  it("caps rows at limit and says so", async () => {
    const get = await setup();
    const result = await get({ limit: 2 });
    expect(result.isOk() && result.value.elements).toHaveLength(2);
    expect(result.isOk() && result.value.truncated).toBe(true);
    expect(result.isOk() && result.value.total).toBe(4);
  });
});
