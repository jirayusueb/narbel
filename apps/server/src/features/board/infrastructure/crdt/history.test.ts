import { describe, expect, it } from "bun:test";

import * as Y from "yjs";

import type { Page } from "../../domain/entities/Page";
import type { SceneElement } from "../../domain/entities/SceneElement";
import { shouldAcceptIncoming } from "../../domain/rules/mergeElement";
import { fileIdsOf, loadState, readSnapshot, restoreScene } from "./history";
import { MemoryBus } from "./MemoryBus";
import { YjsBoardHub } from "./YjsBoardHub";

const MAIN: Page = { id: "page:main", name: "Page 1" };
const rect = (id: string, version = 1, extra: object = {}): SceneElement => ({
  id,
  type: "rectangle",
  x: 0,
  y: 0,
  version,
  versionNonce: 1,
  index: id,
  ...extra,
});

const docWith = (
  elements: Record<string, SceneElement>,
  pages: Page[] = [MAIN]
) => {
  const doc = new Y.Doc();
  doc.getArray("pages").push(pages);
  const map = doc.getMap("elements");
  for (const [key, value] of Object.entries(elements)) {
    map.set(key, value);
  }
  return doc;
};

const elementsOf = (doc: Y.Doc) =>
  doc.getMap<SceneElement>("elements").toJSON();

/** `live` continues the history of the snapshot, like a board edited after a version was taken. */
const fork = (doc: Y.Doc) => {
  const copy = new Y.Doc();
  Y.applyUpdate(copy, Y.encodeStateAsUpdate(doc));
  return copy;
};

const restore = (live: Y.Doc, state: Uint8Array, now = 5000) => {
  const target = loadState(state);
  const changed = restoreScene(live, target, now, "v1");
  target.destroy();
  return changed;
};

describe("restoreScene", () => {
  it("negative control: applying the old state to the live doc keeps later shapes", () => {
    const live = docWith({ "page:main:a": rect("a") });
    const old = Y.encodeStateAsUpdate(live);
    live.getMap("elements").set("page:main:later", rect("later"));
    Y.applyUpdate(live, old);
    expect(Object.keys(elementsOf(live))).toContain("page:main:later");
  });

  it("removes shapes added later, brings back deleted ones, and keeps the rest", () => {
    const live = docWith({
      "page:main:keep": rect("keep"),
      "page:main:gone": rect("gone"),
    });
    const old = Y.encodeStateAsUpdate(live);
    const map = live.getMap<SceneElement>("elements");
    map.set("page:main:gone", rect("gone", 2, { isDeleted: true }));
    map.set("page:main:later", rect("later"));
    map.set("page:main:keep", rect("keep", 3, { x: 99 }));

    expect(restore(live, old)).toBe(true);

    const after = elementsOf(live);
    expect(after["page:main:later"]).toMatchObject({
      isDeleted: true,
      version: 2,
      updated: 5000,
    });
    expect(after["page:main:gone"]?.isDeleted).toBeUndefined();
    expect(after["page:main:gone"]).toMatchObject({ version: 3 });
    expect(after["page:main:keep"]).toMatchObject({ x: 0, version: 4 });
    expect(live.getMap("meta").get("restore")).toEqual({
      versionId: "v1",
      at: 5000,
    });
  });

  it("a second restore of the same version writes nothing", () => {
    const live = docWith({ "page:main:a": rect("a") });
    const old = Y.encodeStateAsUpdate(live);
    live.getMap("elements").set("page:main:later", rect("later"));
    expect(restore(live, old)).toBe(true);
    const once = elementsOf(live);
    expect(restore(live, old)).toBe(false);
    expect(elementsOf(live)).toEqual(once);
  });

  it("keeps the live files map and adds files only the version knows", () => {
    const live = docWith({ "page:main:a": rect("a") });
    live.getMap("files").set("old", { id: "old", mimeType: "image/png" });
    const old = Y.encodeStateAsUpdate(live);
    live.getMap("files").delete("old");
    live.getMap("files").set("new", { id: "new", mimeType: "image/png" });
    restore(live, old);
    expect(Object.keys(live.getMap("files").toJSON()).sort()).toEqual([
      "new",
      "old",
    ]);
  });

  it("follows the version's pages: drops later pages with their shapes, recreates removed ones", () => {
    const second: Page = { id: "page:two", name: "Two" };
    const live = docWith(
      { "page:main:a": rect("a"), "page:two:b": rect("b") },
      [MAIN, second]
    );
    const old = Y.encodeStateAsUpdate(live);
    const pages = live.getArray<Page>("pages");
    pages.delete(1, 1);
    live.getMap("elements").delete("page:two:b");
    const third: Page = { id: "page:three", name: "Three" };
    pages.push([third]);
    live.getMap("elements").set("page:three:c", rect("c"));

    restore(live, old);

    expect(pages.toArray()).toEqual([MAIN, second]);
    expect(Object.keys(elementsOf(live)).sort()).toEqual([
      "page:main:a",
      "page:two:b",
    ]);
    expect(elementsOf(live)["page:two:b"]?.isDeleted).toBeUndefined();
  });

  it("reaches a peer that holds the live doc as an ordinary update", () => {
    const live = docWith({ "page:main:a": rect("a") });
    const peer = fork(live);
    const old = Y.encodeStateAsUpdate(live);
    live.on("update", (update: Uint8Array) => Y.applyUpdate(peer, update));
    live.getMap("elements").set("page:main:later", rect("later"));
    restore(live, old);
    expect(elementsOf(peer)["page:main:later"]?.isDeleted).toBe(true);
  });

  it("a concurrent edit from a client that never saw the restore survives the merge on its own key", () => {
    const live = docWith({ "page:main:a": rect("a") });
    const old = Y.encodeStateAsUpdate(live);
    const offline = fork(live);
    live.getMap("elements").set("page:main:later", rect("later"));
    restore(live, old);
    offline.getMap("elements").set("page:main:fresh", rect("fresh"));
    Y.applyUpdate(live, Y.encodeStateAsUpdate(offline));
    expect(elementsOf(live)["page:main:fresh"]?.isDeleted).toBeUndefined();
    expect(elementsOf(live)["page:main:later"]?.isDeleted).toBe(true);
  });

  it.each([
    ["restore client id lower", 1, 2],
    ["restore client id higher", 2, 1],
  ])(
    "same key edited offline and restored (%s): Yjs picks one value by client id, both docs agree",
    (_name, serverId, offlineId) => {
      const live = docWith({ "page:main:a": rect("a", 1) });
      const old = Y.encodeStateAsUpdate(live);
      live.getMap("elements").set("page:main:a", rect("a", 2, { x: 50 }));
      const offline = fork(live);
      offline.clientID = offlineId;
      live.clientID = serverId;
      offline.getMap("elements").set("page:main:a", rect("a", 5, { x: 200 }));
      restore(live, old);
      Y.applyUpdate(live, Y.encodeStateAsUpdate(offline));
      Y.applyUpdate(offline, Y.encodeStateAsUpdate(live));
      expect(elementsOf(offline)).toEqual(elementsOf(live));
    }
  );

  it("never hands out a version that Excalidraw's rule would reject for the restored key", () => {
    const live = docWith({ "page:main:a": rect("a", 7) });
    const old = Y.encodeStateAsUpdate(live);
    live.getMap("elements").set("page:main:a", rect("a", 9, { x: 5 }));
    restore(live, old);
    const restored = elementsOf(live)["page:main:a"] as SceneElement;
    expect(shouldAcceptIncoming(rect("a", 9), restored)).toBe(true);
  });
});

describe("readSnapshot", () => {
  it("lists live shapes per page in z-order with the files they use", () => {
    const doc = docWith({
      "page:main:b": rect("b", 1, { fileId: "f1", type: "image" }),
      "page:main:a": rect("a"),
      "page:main:d": rect("d", 2, { isDeleted: true, fileId: "f2" }),
    });
    doc.getMap("files").set("f1", { id: "f1", mimeType: "image/png" });
    doc.getMap("files").set("f2", { id: "f2", mimeType: "image/png" });
    const scene = readSnapshot(Y.encodeStateAsUpdate(doc));
    expect(scene.pages).toHaveLength(1);
    expect(scene.pages[0]?.elements.map((e) => e.id)).toEqual(["a", "b"]);
    expect(scene.files.map((f) => f.id)).toEqual(["f1"]);
    expect(fileIdsOf(doc).sort()).toEqual(["f1", "f2"]);
  });
});

const stateOf = (doc: Y.Doc) => Y.encodeStateAsUpdate(doc);

const hubOver = (stored: Uint8Array | null, bus = new MemoryBus()) =>
  new YjsBoardHub(
    { load: () => Promise.resolve(stored), save: () => Promise.resolve("o") },
    bus
  );

describe("YjsBoardHub.restore", () => {
  const board = () => {
    const doc = docWith({ "page:main:a": rect("a") });
    const old = stateOf(doc);
    doc.getMap("elements").set("page:main:later", rect("later"));
    return { old, current: stateOf(doc) };
  };

  it("records the pre-restore state first, then rewrites the live document", async () => {
    const { old, current } = board();
    const hub = hubOver(current);
    const kept: Uint8Array[] = [];
    const outcome = await hub.restore("b1", old, (point) => {
      kept.push(point.state);
      return Promise.resolve();
    });
    expect(outcome).toEqual({ status: "restored", changed: true });
    expect(Object.keys(elementsOf(loadState(kept[0] as Uint8Array)))).toContain(
      "page:main:later"
    );
    expect(
      await hub.transact("b1", (s) => s.all("page:main").map((e) => e.id))
    ).toEqual(["a", "later"]);
    expect(
      await hub.transact("b1", (s) => s.get("page:main", "later")?.isDeleted)
    ).toBe(true);
    await hub.discard("b1");
  });

  it("retries with a fresh recovery point when an edit lands while it is being saved", async () => {
    const { old, current } = board();
    const hub = hubOver(current);
    let calls = 0;
    const outcome = await hub.restore("b1", old, async (point) => {
      calls += 1;
      if (calls === 1) {
        await hub.transact("b1", (s) => s.put("page:main", rect("typed")));
      } else {
        expect(Object.keys(elementsOf(loadState(point.state)))).toContain(
          "page:main:typed"
        );
      }
    });
    expect(outcome.status).toBe("restored");
    expect(calls).toBe(2);
    await hub.discard("b1");
  });

  it("gives up without writing when the board never stops changing", async () => {
    const { old, current } = board();
    const hub = hubOver(current);
    let n = 0;
    const outcome = await hub.restore("b1", old, async () => {
      n += 1;
      await hub.transact("b1", (s) => s.put("page:main", rect(`t${n}`)));
    });
    expect(outcome).toEqual({ status: "busy" });
    expect(
      await hub.transact("b1", (s) => s.get("page:main", "later")?.isDeleted)
    ).toBeUndefined();
    await hub.discard("b1");
  });

  it("reports unsaved, not restored, when the save fails, and saves the restore on retry", async () => {
    const { old, current } = board();
    let failing = true;
    const saved: Uint8Array[] = [];
    const hub = new YjsBoardHub(
      {
        load: () => Promise.resolve(current),
        save: (_id, state) => {
          if (failing) {
            return Promise.reject(new Error("db down"));
          }
          saved.push(state);
          return Promise.resolve("o");
        },
      },
      new MemoryBus()
    );
    const outcome = await hub.restore("b1", old, () => Promise.resolve());
    expect(outcome).toEqual({ status: "unsaved" });
    expect(
      await hub.transact("b1", (s) => s.get("page:main", "later")?.isDeleted)
    ).toBe(true);
    failing = false;
    const retry = await hub.restore("b1", old, () => Promise.resolve());
    expect(retry).toEqual({ status: "restored", changed: false });
    expect(saved).toHaveLength(1);
    expect(
      elementsOf(loadState(saved[0] as Uint8Array))["page:main:later"]
        ?.isDeleted
    ).toBe(true);
    await hub.discard("b1");
  });

  it("is seen by a second server instance holding the same board", async () => {
    const { old, current } = board();
    const bus = new MemoryBus();
    const a = hubOver(current, bus);
    const b = hubOver(current, bus);
    await b.transact("b1", () => {});
    await a.restore("b1", old, () => Promise.resolve());
    for (let i = 0; i < 50; i += 1) {
      await Promise.resolve();
    }
    expect(
      await b.transact("b1", (s) => s.get("page:main", "later")?.isDeleted)
    ).toBe(true);
    await a.discard("b1");
    await b.discard("b1");
  });
});
