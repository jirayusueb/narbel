import { describe, expect, it } from "bun:test";

import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";
import * as awarenessProtocol from "y-protocols/awareness";
import * as syncProtocol from "y-protocols/sync";
import * as Y from "yjs";

import type { SyncPeer } from "../../application/ports/IBoardSyncGateway";
import type { SceneVersion } from "../../domain/values/ChangeCursor";
import { touchesSince } from "./changes";
import { MemoryBus } from "./MemoryBus";
import { YjsBoardHub } from "./YjsBoardHub";

const emptyStore = {
  load: () => Promise.resolve(null),
  save: () => Promise.resolve("owner"),
};

/** A browser stand-in speaking the y-websocket protocol to the hub. */
class Browser {
  readonly doc = new Y.Doc();
  readonly awareness = new awarenessProtocol.Awareness(this.doc);
  inbox = 0;
  session: { receive(m: Uint8Array): void; close(): void } | undefined;

  constructor() {
    this.doc.on("update", (update: Uint8Array, origin: unknown) => {
      if (origin !== "remote") {
        const e = encoding.createEncoder();
        encoding.writeVarUint(e, 0);
        syncProtocol.writeUpdate(e, update);
        this.session?.receive(encoding.toUint8Array(e));
      }
    });
  }

  peer(): SyncPeer {
    return {
      send: (message) => {
        this.inbox += 1;
        const decoder = decoding.createDecoder(message);
        if (decoding.readVarUint(decoder) === 0) {
          const reply = encoding.createEncoder();
          encoding.writeVarUint(reply, 0);
          syncProtocol.readSyncMessage(decoder, reply, this.doc, "remote");
          if (encoding.length(reply) > 1) {
            this.session?.receive(encoding.toUint8Array(reply));
          }
        }
      },
      close: () => {},
    };
  }

  async join(hub: YjsBoardHub) {
    this.session = await hub.connect("b1", this.peer(), true, () =>
      Promise.resolve("write" as const)
    );
    const e = encoding.createEncoder();
    encoding.writeVarUint(e, 0);
    syncProtocol.writeSyncStep1(e, this.doc);
    this.session.receive(encoding.toUint8Array(e));
  }

  put(id: string, x: number, extra: Record<string, unknown> = {}) {
    this.doc.getMap("elements").set(`page:main:${id}`, {
      id,
      type: "rectangle",
      version: 1,
      versionNonce: 1,
      x,
      y: 0,
      ...extra,
    });
  }
}

const agentPut = (hub: YjsBoardHub, id: string, x = 0) =>
  hub.transact("b1", (s) =>
    s.put("page:main", {
      id,
      type: "rectangle",
      version: 1,
      versionNonce: 1,
      x,
      y: 0,
      rest: {},
    })
  );

const now = async (hub: YjsBoardHub) => {
  const found = await hub.transact("b1", (s) => s.changesSince(null));
  if (!found) {
    throw new Error("expected a version");
  }
  return found.version;
};

const since = async (hub: YjsBoardHub, version: SceneVersion) => {
  const found = await hub.transact("b1", (s) => s.changesSince(version));
  if (!found) {
    throw new Error("expected changes");
  }
  return found;
};

const summary = (
  touches: { element: { id: string }; existedAtCursor: boolean }[]
) =>
  touches
    .map((t) => `${t.element.id}:${t.existedAtCursor}`)
    .toSorted((a, b) => a.localeCompare(b));

const settle = async () => {
  for (let i = 0; i < 50; i += 1) {
    await Promise.resolve();
  }
};

describe("changesSince on a live board", () => {
  it("reports a browser moving an existing element, with its new position", async () => {
    const hub = new YjsBoardHub(emptyStore, new MemoryBus());
    const browser = new Browser();
    await browser.join(hub);
    browser.put("a", 0);
    const cursor = await now(hub);
    browser.put("a", 40);
    const { touches } = await since(hub, cursor);
    expect(summary(touches)).toEqual(["a:true"]);
    expect(touches[0]?.element.x).toBe(40);
    expect(touches[0]?.pageId).toBe("page:main");
  });

  it("reports a browser adding an element as new", async () => {
    const hub = new YjsBoardHub(emptyStore, new MemoryBus());
    const browser = new Browser();
    await browser.join(hub);
    browser.put("a", 0);
    const cursor = await now(hub);
    browser.put("b", 5);
    expect(summary((await since(hub, cursor)).touches)).toEqual(["b:false"]);
  });

  it("starts a watch with no touches", async () => {
    const hub = new YjsBoardHub(emptyStore, new MemoryBus());
    const browser = new Browser();
    await browser.join(hub);
    browser.put("a", 0);
    const found = await hub.transact("b1", (s) => s.changesSince(null));
    expect(found?.touches).toEqual([]);
  });

  it("hides agent writes, but reports a browser edit on top of one", async () => {
    const hub = new YjsBoardHub(emptyStore, new MemoryBus());
    const browser = new Browser();
    await browser.join(hub);
    const cursor = await now(hub);
    await agentPut(hub, "c", 1);
    expect((await since(hub, cursor)).touches).toEqual([]);
    browser.put("c", 99);
    expect(summary((await since(hub, cursor)).touches)).toEqual(["c:false"]);
  });

  it("does not report agent writes made on another instance", async () => {
    const bus = new MemoryBus();
    const a = new YjsBoardHub(emptyStore, bus);
    const b = new YjsBoardHub(emptyStore, bus);
    await a.transact("b1", () => {});
    await b.transact("b1", () => {});
    await settle();
    const cursor = await now(b);
    await agentPut(a, "x");
    await settle();
    expect(await b.transact("b1", (s) => s.all("page:main").length)).toBe(1);
    expect((await since(b, cursor)).touches).toEqual([]);
  });

  it("gives the same answer after the room reloads from the stored state", async () => {
    const first = new YjsBoardHub(emptyStore, new MemoryBus());
    const browser = new Browser();
    await browser.join(first);
    browser.put("a", 0);
    const cursor = await now(first);
    browser.put("a", 7);
    browser.put("n", 1);
    // the browser holds the hub's whole document, so it is what a save would have stored
    const stored = Y.encodeStateAsUpdate(browser.doc);
    await first.discard("b1");

    const second = new YjsBoardHub(
      { load: () => Promise.resolve(stored), save: emptyStore.save },
      new MemoryBus()
    );
    const { touches } = await since(second, cursor);
    expect(summary(touches)).toEqual(["a:true", "n:false"]);
    expect(touches.find((t) => t.element.id === "a")?.element.x).toBe(7);
    await second.discard("b1");
  });

  it("does not register a writer or notify peers on a read-only transact", async () => {
    const hub = new YjsBoardHub(emptyStore, new MemoryBus());
    const browser = new Browser();
    await browser.join(hub);
    const agentsBefore = [...browser.doc.getMap("agents").keys()];
    const inboxBefore = browser.inbox;
    await hub.transact("b1", (s) => s.changesSince(null));
    await hub.transact("b1", (s) => s.pages());
    expect([...browser.doc.getMap("agents").keys()]).toEqual(agentsBefore);
    expect(browser.inbox).toBe(inboxBefore);
    await hub.discard("b1");
  });

  it("never reports a pruned deletion, before or after the prune", async () => {
    const DAY = 24 * 60 * 60 * 1000;
    const first = new YjsBoardHub(emptyStore, new MemoryBus());
    const browser = new Browser();
    await browser.join(first);
    browser.put("keep", 0);
    browser.put("a", 0);
    const before = await now(first);
    browser.put("a", 0, { isDeleted: true, updated: Date.now() - 2 * DAY });
    const stored = Y.encodeStateAsUpdate(browser.doc);
    await first.discard("b1");
    const second = new YjsBoardHub(
      { load: () => Promise.resolve(stored), save: emptyStore.save },
      new MemoryBus()
    );

    expect(await second.transact("b1", (s) => s.get("page:main", "a"))).toBe(
      undefined
    );
    expect((await since(second, before)).touches).toEqual([]);
    expect((await since(second, await now(second))).touches).toEqual([]);
    await second.discard("b1");
  });
});

/** Applies everything `from` has to `to`, the way a synced peer would. */
const sync = (from: Y.Doc, to: Y.Doc) => {
  Y.applyUpdate(to, Y.encodeStateAsUpdate(from));
};

const put = (doc: Y.Doc, id: string, x: number) => {
  doc.getMap("elements").set(`page:main:${id}`, { id, x });
};

describe("touchesSince on documents", () => {
  it("keeps the clocks of a cursor that is ahead of this instance", () => {
    const server = new Y.Doc();
    const human = new Y.Doc();
    put(human, "a", 1);
    put(human, "a", 2);
    sync(human, server);
    const ahead = Y.encodeStateVector(
      new Map([[human.clientID, 100]])
    ) as SceneVersion;

    const found = touchesSince(server, ahead);
    expect(found?.touches).toEqual([]);
    expect(
      Y.decodeStateVector(found?.version as SceneVersion).get(human.clientID)
    ).toBe(100);
  });

  it("drops clients whose writes are all overwritten, and still reports their new writes", () => {
    const server = new Y.Doc();
    const first = new Y.Doc();
    const second = new Y.Doc();
    put(first, "k", 1);
    sync(first, server);
    sync(server, second);
    put(second, "k", 2);
    sync(second, server);

    const version = touchesSince(server, null)?.version as SceneVersion;
    const clients = Y.decodeStateVector(version);
    expect(clients.has(first.clientID)).toBe(false);
    expect(clients.has(second.clientID)).toBe(true);

    put(first, "m", 3);
    sync(first, server);
    const after = touchesSince(server, version);
    expect(after?.touches.map((t) => t.element.id)).toEqual(["m"]);
  });

  it("reports a browser edit an agent overwrote, even when the browser's writes span the cursor", () => {
    const server = new Y.Doc();
    const human = new Y.Doc();
    put(human, "k", 1);
    sync(human, server);
    const cursor = touchesSince(server, null)?.version as SceneVersion;
    put(human, "k", 2);
    put(human, "k", 3);
    sync(human, server);
    server.transact(() => {
      server.getMap("agents").set(String(server.clientID), true);
      put(server, "k", 4);
    });

    const found = touchesSince(server, cursor);
    expect(
      found?.touches.map((t) => [t.element.id, t.existedAtCursor])
    ).toEqual([["k", true]]);
  });

  it("returns undefined for bytes that are not a version", () => {
    const garbage = new Uint8Array([255, 255, 255]) as SceneVersion;
    expect(touchesSince(new Y.Doc(), garbage)).toBeUndefined();
  });
});
