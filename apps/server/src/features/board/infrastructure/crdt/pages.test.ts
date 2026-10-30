import { describe, expect, it } from "bun:test";

import * as Y from "yjs";

import { ensurePages, sceneAccess } from "./pages";

const el = (id: string) => ({
  id,
  type: "rectangle",
  version: 1,
  versionNonce: 1,
});

describe("ensurePages", () => {
  it("moves a v1 document's bare element keys onto page:main", () => {
    const doc = new Y.Doc();
    const elements = doc.getMap("elements");
    elements.set("a", el("a"));
    elements.set("b", el("b"));
    doc
      .getMap("files")
      .set("f1", { id: "f1", mimeType: "image/png", created: 1 });

    expect(ensurePages(doc, "test")).toBe(true);

    expect(doc.getArray("pages").toArray()).toEqual([
      { id: "page:main", name: "Page 1" },
    ]);
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

  it("stacks new elements on top, puts a label right above its container, and keeps keys on update", () => {
    const doc = new Y.Doc();
    ensurePages(doc, "t");
    const scene = sceneAccess(doc);
    // an element a browser already ordered keeps its key
    scene.put("page:main", { ...el("drawn"), index: "a5" });
    scene.put("page:main", el("box"));
    scene.put("page:main", el("next"));
    scene.put("page:main", {
      ...el("label"),
      type: "text",
      containerId: "box",
    });
    const key = (id: string) => String(scene.get("page:main", id)?.index);
    expect(key("drawn")).toBe("a5");
    expect(key("box") > key("drawn")).toBe(true);
    expect(key("next") > key("box")).toBe(true);
    expect(key("label") > key("box") && key("label") < key("next")).toBe(true);

    const before = key("box");
    scene.put("page:main", { ...el("box"), version: 2, index: before });
    expect(key("box")).toBe(before);
  });

  it("puts a new frame child right below its frame, in order, and its label between child and frame", () => {
    const doc = new Y.Doc();
    ensurePages(doc, "t");
    const scene = sceneAccess(doc);
    scene.put("page:main", { ...el("under"), index: "a1" });
    scene.put("page:main", { ...el("frame"), type: "frame" });
    scene.put("page:main", el("top"));
    scene.put("page:main", { ...el("one"), frameId: "frame" });
    scene.put("page:main", { ...el("two"), frameId: "frame" });
    scene.put("page:main", {
      ...el("label"),
      type: "text",
      containerId: "one",
      frameId: "frame",
    });
    const order = scene
      .all("page:main")
      .sort((a, b) => (String(a.index) < String(b.index) ? -1 : 1))
      .map((e) => e.id);
    expect(order).toEqual(["under", "one", "label", "two", "frame", "top"]);
  });
});

describe("ensureFile", () => {
  it("registers a file once and keeps the existing entry", () => {
    const doc = new Y.Doc();
    const scene = sceneAccess(doc);
    scene.ensureFile({ id: "f1", mimeType: "image/png", created: 1 });
    scene.ensureFile({ id: "f1", mimeType: "image/jpeg", created: 2 });
    expect(doc.getMap("files").get("f1")).toEqual({
      id: "f1",
      mimeType: "image/png",
      created: 1,
    });
  });
});
