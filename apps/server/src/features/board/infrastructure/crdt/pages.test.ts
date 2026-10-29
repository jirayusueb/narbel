import { describe, expect, it } from "bun:test";
import * as Y from "yjs";

import { ensurePages, sceneAccess } from "./pages";

const el = (id: string) => ({ id, type: "rectangle", version: 1, versionNonce: 1 });

describe("ensurePages", () => {
  it("moves a v1 document's bare element keys onto page:main", () => {
    const doc = new Y.Doc();
    const elements = doc.getMap("elements");
    elements.set("a", el("a"));
    elements.set("b", el("b"));
    doc.getMap("files").set("f1", { id: "f1", mimeType: "image/png", created: 1 });

    expect(ensurePages(doc, "test")).toBe(true);

    expect(doc.getArray("pages").toArray()).toEqual([{ id: "page:main", name: "Page 1" }]);
    expect([...elements.keys()].sort()).toEqual(["page:main:a", "page:main:b"]);
    expect(elements.get("page:main:a")).toEqual(el("a"));
    expect(doc.getMap("files").get("f1")).toBeDefined();
  });

  it("gives an empty board its first page and leaves migrated docs alone", () => {
    const doc = new Y.Doc();
    expect(ensurePages(doc, "test")).toBe(true);
    expect(doc.getArray("pages")).toHaveLength(1);
    expect(ensurePages(doc, "test")).toBe(false);
    expect(doc.getArray("pages")).toHaveLength(1);
  });

  it("survives a persisted round trip", () => {
    const first = new Y.Doc();
    first.getMap("elements").set("a", el("a"));
    ensurePages(first, "test");
    const second = new Y.Doc();
    Y.applyUpdate(second, Y.encodeStateAsUpdate(first));
    expect(ensurePages(second, "test")).toBe(false);
    expect(sceneAccess(second).get("page:main", "a")).toEqual(el("a"));
  });
});

describe("sceneAccess", () => {
  it("scopes elements per page and removes a page with its elements", () => {
    const doc = new Y.Doc();
    ensurePages(doc, "t");
    const scene = sceneAccess(doc);
    scene.addPage({ id: "page:two", name: "Two" });
    scene.put("page:main", el("a"));
    scene.put("page:two", el("b"));
    expect(scene.all("page:main").map((e) => e.id)).toEqual(["a"]);
    expect(scene.find("b")?.pageId).toBe("page:two");
    expect(scene.renamePage("page:two", "Deux")).toBe(true);
    expect(scene.removePage("page:two")).toBe(true);
    expect(scene.find("b")).toBeUndefined();
    expect(scene.removePage("page:two")).toBe(false);
  });
});
