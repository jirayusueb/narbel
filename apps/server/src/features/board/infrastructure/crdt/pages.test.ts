import { describe, expect, it } from "bun:test";

import * as Y from "yjs";

import { toElement } from "../../application/dtos/ExcalidrawElement";
import {
  TOMBSTONE_TTL_MS,
  ensurePages,
  pruneTombstones,
  sceneAccess,
} from "./pages";

const el = (id: string) => ({
  id,
  type: "rectangle",
  version: 1,
  versionNonce: 1,
});

const NOW = 1_000_000_000_000;
const dead = (id: string, updated?: unknown) => ({
  ...el(id),
  isDeleted: true,
  updated,
});

describe("pruneTombstones", () => {
  it("removes only tombstones older than the window, and is idempotent", () => {
    const doc = new Y.Doc();
    const elements = doc.getMap("elements");
    elements.set("p:live", { ...el("live"), updated: 1 });
    elements.set("p:old", dead("old", NOW - TOMBSTONE_TTL_MS - 1));
    elements.set("p:young", dead("young", NOW - TOMBSTONE_TTL_MS + 1));
    elements.set("p:blank", dead("blank"));
    elements.set("p:text", dead("text", "yesterday"));
    elements.set("p:null", null);
    elements.set("p:num", 7);

    expect(pruneTombstones(doc, NOW, null)).toBe(1);
    expect([...elements.keys()].sort()).toEqual([
      "p:blank",
      "p:live",
      "p:null",
      "p:num",
      "p:text",
      "p:young",
    ]);
    expect(pruneTombstones(doc, NOW, null)).toBe(0);
  });

  it("lets an offline undo of a deletion win in either client-id order", () => {
    for (const [serverId, browserId] of [
      [1, 2],
      [2, 1],
    ] as const) {
      const author = new Y.Doc();
      author.clientID = 9;
      author
        .getMap("elements")
        .set("p:a", dead("a", NOW - 2 * TOMBSTONE_TTL_MS));
      const stored = Y.encodeStateAsUpdate(author);

      const server = new Y.Doc();
      server.clientID = serverId;
      Y.applyUpdate(server, stored);
      const browser = new Y.Doc();
      browser.clientID = browserId;
      Y.applyUpdate(browser, stored);

      pruneTombstones(server, NOW, null);
      browser.getMap("elements").set("p:a", { ...el("a"), version: 3 });
      Y.applyUpdate(server, Y.encodeStateAsUpdate(browser));
      Y.applyUpdate(browser, Y.encodeStateAsUpdate(server));

      for (const doc of [server, browser]) {
        expect(doc.getMap("elements").get("p:a")).toMatchObject({
          version: 3,
        });
      }
    }
  });
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
    expect(sceneAccess(second).get("page:main", "a")).toEqual(
      toElement(el("a"))
    );
  });
});

describe("sceneAccess", () => {
  it("scopes elements per page and removes a page with its elements", () => {
    const doc = new Y.Doc();
    ensurePages(doc, "t");
    const scene = sceneAccess(doc);
    scene.addPage({ id: "page:two", name: "Two" });
    scene.put("page:main", toElement(el("a")));
    scene.put("page:two", toElement(el("b")));
    expect(scene.all("page:main").map((e) => e.id)).toEqual(["a"]);
    expect(scene.locate("b")?.pageId).toBe("page:two");
    expect(scene.renamePage("page:two", "Deux")).toBe(true);
    expect(scene.removePage("page:two")).toBe(true);
    expect(scene.locate("b")).toBeUndefined();
    expect(scene.removePage("page:two")).toBe(false);
  });

  it("stacks new elements on top, puts a label right above its container, and keeps keys on update", () => {
    const doc = new Y.Doc();
    ensurePages(doc, "t");
    const scene = sceneAccess(doc);
    // an element a browser already ordered keeps its key
    scene.put("page:main", toElement({ ...el("drawn"), index: "a5" }));
    scene.put("page:main", toElement(el("box")));
    scene.put("page:main", toElement(el("next")));
    scene.put(
      "page:main",
      toElement({ ...el("label"), type: "text", containerId: "box" })
    );
    const key = (id: string) => String(scene.get("page:main", id)?.index);
    expect(key("drawn")).toBe("a5");
    expect(key("box") > key("drawn")).toBe(true);
    expect(key("next") > key("box")).toBe(true);
    expect(key("label") > key("box") && key("label") < key("next")).toBe(true);

    const before = key("box");
    scene.put(
      "page:main",
      toElement({ ...el("box"), version: 2, index: before })
    );
    expect(key("box")).toBe(before);
  });

  it("puts a new frame child right below its frame, in order, and its label between child and frame", () => {
    const doc = new Y.Doc();
    ensurePages(doc, "t");
    const scene = sceneAccess(doc);
    scene.put("page:main", toElement({ ...el("under"), index: "a1" }));
    scene.put("page:main", toElement({ ...el("frame"), type: "frame" }));
    scene.put("page:main", toElement(el("top")));
    scene.put("page:main", toElement({ ...el("one"), frameId: "frame" }));
    scene.put("page:main", toElement({ ...el("two"), frameId: "frame" }));
    scene.put(
      "page:main",
      toElement({
        ...el("label"),
        type: "text",
        containerId: "one",
        frameId: "frame",
      })
    );
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
