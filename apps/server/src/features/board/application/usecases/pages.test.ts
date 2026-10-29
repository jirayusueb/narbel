import { describe, expect, it } from "bun:test";

import { AddPage } from "./AddPage";
import { DeletePage } from "./DeletePage";
import { RenamePage } from "./RenamePage";
import { EditSelection, GetSelection, SelectElements } from "./Selection";
import { ids, setupAccess } from "./fakes";

const actor = { userId: "owner" };

describe("pages", () => {
  it("adds, renames and deletes pages, keeping the last one", async () => {
    const { guard, scenes } = setupAccess();
    const added = await new AddPage(guard, scenes, ids).execute({ actor, boardId: "b1", name: " Two " });
    const page = added.isOk() ? added.value : undefined;
    expect(page?.name).toBe("Two");
    expect(scenes.pageList).toHaveLength(2);
    const renamed = await new RenamePage(guard, scenes).execute({ actor, boardId: "b1", pageId: page?.id ?? "", name: "Deux" });
    expect(renamed.isOk()).toBe(true);
    expect(scenes.pageList[1]?.name).toBe("Deux");
    const del = new DeletePage(guard, scenes);
    expect((await del.execute({ actor, boardId: "b1", pageId: page?.id ?? "" })).isOk()).toBe(true);
    const last = await del.execute({ actor, boardId: "b1", pageId: "page:main" });
    expect(last.isErr() && last.error.code).toBe("Conflict");
    const missing = await del.execute({ actor, boardId: "b1", pageId: "ghost" });
    expect(missing.isErr() && missing.error.code).toBe("NotFound");
  });

  it("rejects bad page names", async () => {
    const { guard, scenes } = setupAccess();
    const add = new AddPage(guard, scenes, ids);
    expect((await add.execute({ actor, boardId: "b1", name: " " })).isErr()).toBe(true);
    expect((await add.execute({ actor, boardId: "b1", name: "a".repeat(81) })).isErr()).toBe(true);
  });
});

describe("selection tools", () => {
  const seed = (scenes: ReturnType<typeof setupAccess>["scenes"]) => {
    for (const id of ["a", "b"]) {
      scenes.elements.set(`page:main:${id}`, { id, type: "rectangle", version: 1, versionNonce: 1, x: 0, y: 0 });
    }
  };

  it("reads the live selection and patches only the selected elements", async () => {
    const { guard, scenes } = setupAccess();
    seed(scenes);
    scenes.selection = ["a", "ghost"];
    const got = await new GetSelection(guard, scenes).execute({ actor, boardId: "b1" });
    expect(got.isOk() && got.value.ids).toEqual(["a"]);
    const edited = await new EditSelection(guard, scenes, ids).execute({ actor, boardId: "b1", patch: { x: 9, version: 50 } });
    expect(edited.isOk() && edited.value.updated).toEqual(["a"]);
    expect(scenes.elements.get("page:main:a")).toMatchObject({ x: 9, version: 2 });
    expect(scenes.elements.get("page:main:b")).toMatchObject({ x: 0, version: 1 });
  });

  it("reports no selection when no client is connected", async () => {
    const { guard, scenes } = setupAccess();
    const got = await new GetSelection(guard, scenes).execute({ actor, boardId: "b1" });
    expect(got.isErr() && got.error.code).toBe("NotFound");
    const edit = await new EditSelection(guard, scenes, ids).execute({ actor, boardId: "b1", patch: { x: 1 } });
    expect(edit.isErr()).toBe(true);
  });

  it("select publishes only existing elements", async () => {
    const { guard, scenes } = setupAccess();
    seed(scenes);
    const picked = await new SelectElements(guard, scenes).execute({ actor, boardId: "b1", ids: ["b", "ghost"] });
    expect(picked.isOk() && picked.value.ids).toEqual(["b"]);
    expect(scenes.selection).toEqual(["b"]);
  });
});
