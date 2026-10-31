import { describe, expect, it, setSystemTime } from "bun:test";

import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";
import * as awarenessProtocol from "y-protocols/awareness";
import * as syncProtocol from "y-protocols/sync";
import * as Y from "yjs";

import type { TextChange } from "../../application/ports/IBoardDocumentStore";
import type { SyncPeer } from "../../application/ports/IBoardSyncGateway";
import { MemoryBus } from "./MemoryBus";
import { YjsBoardHub } from "./YjsBoardHub";

const store = {
  load: () => Promise.resolve(null),
  save: () => Promise.resolve("owner"),
};

/** A browser stand-in: a local Y.Doc that speaks the y-websocket wire protocol to the hub. */
class Client {
  readonly doc = new Y.Doc();
  readonly awareness = new awarenessProtocol.Awareness(this.doc);
  readonly inbox: Uint8Array[] = [];
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
        this.inbox.push(message);
        const decoder = decoding.createDecoder(message);
        const type = decoding.readVarUint(decoder);
        if (type === 1) {
          awarenessProtocol.applyAwarenessUpdate(
            this.awareness,
            decoding.readVarUint8Array(decoder),
            "remote"
          );
        } else if (type === 0) {
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

  setSelection(ids: string[]) {
    this.awareness.setLocalStateField("selection", ids);
    const e = encoding.createEncoder();
    encoding.writeVarUint(e, 1);
    encoding.writeVarUint8Array(
      e,
      awarenessProtocol.encodeAwarenessUpdate(this.awareness, [
        this.doc.clientID,
      ])
    );
    this.session?.receive(encoding.toUint8Array(e));
  }
}

const join = async (hub: YjsBoardHub, client: Client, canWrite: boolean) => {
  client.session = await hub.connect("b1", client.peer(), canWrite);
  // start the sync handshake the way y-websocket does: send our step 1
  const e = encoding.createEncoder();
  encoding.writeVarUint(e, 0);
  syncProtocol.writeSyncStep1(e, client.doc);
  client.session.receive(encoding.toUint8Array(e));
};

describe("YjsBoardHub roles", () => {
  it("applies an editor's changes and fans them out", async () => {
    const hub = new YjsBoardHub(store, new MemoryBus());
    const editor = new Client();
    const watcher = new Client();
    await join(hub, editor, true);
    await join(hub, watcher, false);
    editor.doc.getMap("elements").set("page:main:a", { id: "a" });
    expect(watcher.doc.getMap("elements").get("page:main:a")).toEqual({
      id: "a",
    });
    expect(await hub.transact("b1", (s) => s.pages().length)).toBe(1);
  });

  it("never applies a viewer's updates, but still serves it the document", async () => {
    const hub = new YjsBoardHub(store, new MemoryBus());
    const editor = new Client();
    const viewer = new Client();
    await join(hub, editor, true);
    editor.doc.getMap("elements").set("page:main:a", { id: "a" });
    await join(hub, viewer, false);
    expect(viewer.doc.getMap("elements").get("page:main:a")).toEqual({
      id: "a",
    });

    viewer.doc.getMap("elements").set("page:main:evil", { id: "evil" });
    viewer.doc.getMap("elements").delete("page:main:a");

    const late = new Client();
    await join(hub, late, false);
    expect(late.doc.getMap("elements").get("page:main:evil")).toBeUndefined();
    expect(late.doc.getMap("elements").get("page:main:a")).toEqual({ id: "a" });
    expect(editor.doc.getMap("elements").get("page:main:evil")).toBeUndefined();
    const server = await hub.transact("b1", (s) =>
      s.all("page:main").map((e) => e.id)
    );
    expect(server).toEqual(["a"]);
  });

  it("still relays a viewer's awareness and exposes selections to MCP tools", async () => {
    const hub = new YjsBoardHub(store, new MemoryBus());
    const editor = new Client();
    const viewer = new Client();
    await join(hub, editor, true);
    await join(hub, viewer, false);
    expect(await hub.getSelection("b1")).toEqual([]);
    editor.setSelection(["x"]);
    expect(await hub.getSelection("b1")).toEqual(["x"]);
    viewer.setSelection(["y", "z"]);
    expect(await hub.getSelection("b1")).toEqual(["y", "z"]);
    expect(
      editor.awareness.getStates().get(viewer.doc.clientID)?.selection
    ).toEqual(["y", "z"]);

    await hub.setSelection("b1", {
      pageId: "page:main",
      ids: ["m"],
      reveal: false,
    });
    expect(await hub.getSelection("b1")).toEqual(["m"]);
    const states = [...editor.awareness.getStates().values()];
    expect(states.some((state) => state.mcp === true)).toBe(true);
  });

  it("has no selection while nobody is connected", async () => {
    expect(
      await new YjsBoardHub(store, new MemoryBus()).getSelection("b1")
    ).toBeUndefined();
  });

  it("publishes the agent selection with its page, and a fresh reveal only per focus", async () => {
    const hub = new YjsBoardHub(store, new MemoryBus());
    const editor = new Client();
    await join(hub, editor, true);
    const mcp = () =>
      [...editor.awareness.getStates().values()].find((s) => s.mcp === true);

    await hub.setSelection("b1", {
      pageId: "page:main",
      ids: ["a"],
      reveal: true,
    });
    expect(mcp()).toMatchObject({
      pageId: "page:main",
      selection: ["a"],
      reveal: 1,
    });
    await hub.setSelection("b1", {
      pageId: "page:main",
      ids: ["a"],
      reveal: true,
    });
    expect(mcp()?.reveal).toBe(2);
    await hub.setSelection("b1", {
      pageId: undefined,
      ids: [],
      reveal: false,
    });
    expect(mcp()?.reveal).toBeUndefined();
    expect(mcp()?.pageId).toBeUndefined();
    const mcpClient = [...editor.awareness.getStates()].find(
      ([, s]) => s.mcp === true
    )?.[0];
    expect(editor.doc.getMap("agents").has(String(mcpClient))).toBe(true);
  });
});

// the bus delivers through chained microtasks (publish, reply, apply)
const settle = async () => {
  for (let i = 0; i < 50; i += 1) {
    await Promise.resolve();
  }
};

describe("YjsBoardHub across instances", () => {
  const instances = () => {
    const bus = new MemoryBus();
    return {
      bus,
      a: new YjsBoardHub(store, bus),
      b: new YjsBoardHub(store, bus),
    };
  };

  it("converges document edits and presence between two instances", async () => {
    const { a, b } = instances();
    const onA = new Client();
    const onB = new Client();
    await join(a, onA, true);
    await join(b, onB, true);
    await settle();
    onA.doc.getMap("elements").set("page:main:a", { id: "a" });
    onB.doc.getMap("elements").set("page:main:b", { id: "b" });
    await settle();
    for (const client of [onA, onB]) {
      expect([...client.doc.getMap("elements").keys()].sort()).toEqual([
        "page:main:a",
        "page:main:b",
      ]);
    }
    onA.setSelection(["a"]);
    await settle();
    expect(onB.awareness.getStates().get(onA.doc.clientID)?.selection).toEqual([
      "a",
    ]);
    expect(await b.getSelection("b1")).toEqual(["a"]);
  });

  it("does not apply a viewer's edits on either instance", async () => {
    const { a, b } = instances();
    const editor = new Client();
    const viewer = new Client();
    await join(a, editor, true);
    await join(b, viewer, false);
    await settle();
    viewer.doc.getMap("elements").set("page:main:evil", { id: "evil" });
    await settle();
    expect(editor.doc.getMap("elements").get("page:main:evil")).toBeUndefined();
    expect(await a.transact("b1", (s) => s.all("page:main").length)).toBe(0);
    expect(await b.transact("b1", (s) => s.all("page:main").length)).toBe(0);
  });

  it("lets a freshly loaded instance catch up from a running one", async () => {
    const { bus, a } = instances();
    const editor = new Client();
    await join(a, editor, true);
    editor.doc.getMap("elements").set("page:main:a", { id: "a" });
    const late = new YjsBoardHub(store, bus);
    const lateClient = new Client();
    await join(late, lateClient, false);
    await settle();
    expect(lateClient.doc.getMap("elements").get("page:main:a")).toEqual({
      id: "a",
    });
  });

  it("unsubscribes from the bus when the room is dropped", async () => {
    const { bus, a } = instances();
    await a.transact("b1", () => {});
    expect(bus.subscribers("sync:b1")).toBe(1);
    await a.discard("b1");
    expect(bus.subscribers("sync:b1")).toBe(0);
  });
});

const sleep = (ms: number) => Bun.sleep(ms);
const timing = { debounceMs: 20, maxDelayMs: 100, graceMs: 150 };

describe("YjsBoardHub persistence", () => {
  const recorder = () => {
    const saves: { state: Uint8Array; texts: TextChange | undefined }[] = [];
    let loads = 0;
    return {
      saves,
      loads: () => loads,
      store: {
        load: () => {
          loads += 1;
          return Promise.resolve(null);
        },
        save: (
          _id: string,
          state: Uint8Array,
          texts: TextChange | undefined
        ) => {
          saves.push({ state, texts });
          return Promise.resolve("owner");
        },
      },
    };
  };
  const text = (id: string, value: string, version = 1) => ({
    id,
    version,
    versionNonce: version,
    type: "text",
    text: value,
    rest: {},
  });

  it("writes text rows only when the text changed, and only the difference", async () => {
    const { saves, store: db } = recorder();
    const hub = new YjsBoardHub(db, new MemoryBus(), timing);
    await hub.transact("b1", (s) => {
      s.put("page:main", text("a", "one"));
      s.put("page:main", text("b", "two"));
    });
    await sleep(60);
    expect(saves).toHaveLength(1);
    expect(saves[0]?.texts?.replaceAll).toBe(true);
    expect(saves[0]?.texts?.upsert).toHaveLength(2);

    await hub.transact("b1", (s) => {
      s.put("page:main", {
        id: "r",
        version: 1,
        versionNonce: 1,
        type: "rectangle",
        x: 1,
        rest: {},
      });
    });
    await sleep(60);
    expect(saves).toHaveLength(2);
    expect(saves[1]?.texts).toBeUndefined();

    await hub.transact("b1", (s) => s.put("page:main", text("a", "uno", 2)));
    await sleep(60);
    expect(saves[2]?.texts).toEqual({
      replaceAll: false,
      upsert: [{ pageId: "page:main", elementId: "a", text: "uno" }],
      remove: [],
    });

    await hub.transact("b1", (s) =>
      s.put("page:main", { ...text("b", "two", 2), isDeleted: true })
    );
    await sleep(60);
    expect(saves[3]?.texts).toEqual({
      replaceAll: false,
      upsert: [],
      remove: [{ pageId: "page:main", elementId: "b" }],
    });
    await hub.discard("b1");
  });

  it("keeps an unused room loaded for the grace period, then saves and unloads it", async () => {
    const { saves, loads, store: db } = recorder();
    const hub = new YjsBoardHub(db, new MemoryBus(), timing);
    await hub.transact("b1", (s) => s.put("page:main", text("a", "one")));
    await sleep(80);
    expect(saves).toHaveLength(1);
    await hub.transact("b1", () => {});
    await sleep(100);
    // 180ms since the first call, but the second one restarted the grace
    await hub.transact("b1", () => {});
    expect(loads()).toBe(1);
    await sleep(220);
    await hub.transact("b1", () => {});
    expect(loads()).toBe(2);
    await hub.discard("b1");
  });

  it("saves pending changes before unloading", async () => {
    const { saves, store: db } = recorder();
    const hub = new YjsBoardHub(db, new MemoryBus(), {
      debounceMs: 500,
      maxDelayMs: 1000,
      graceMs: 30,
    });
    await hub.transact("b1", (s) => s.put("page:main", text("a", "one")));
    await sleep(80);
    expect(saves).toHaveLength(1);
  });

  it("saves continuous edits within the maximum delay", async () => {
    const { saves, store: db } = recorder();
    const hub = new YjsBoardHub(db, new MemoryBus(), timing);
    const editor = new Client();
    await join(hub, editor, true);
    const map = editor.doc.getMap("elements");
    const start = Date.now();
    // updates arrive more often than the debounce, so only the cap can trigger a save
    while (saves.length === 0 && Date.now() - start < 400) {
      map.set("page:main:a", { id: "a", x: Date.now() });
      await sleep(5);
    }
    expect(saves.length).toBeGreaterThan(0);
    expect(Date.now() - start).toBeLessThan(200);
    await hub.discard("b1");
  });

  describe("tombstone pruning on load", () => {
    const DAY = 24 * 60 * 60 * 1000;
    const stateWith = (updated: number) => {
      const doc = new Y.Doc();
      doc.getArray("pages").push([{ id: "page:main", name: "Page 1" }]);
      const elements = doc.getMap("elements");
      elements.set("page:main:live", { id: "live", version: 1 });
      elements.set("page:main:gone", {
        id: "gone",
        version: 2,
        isDeleted: true,
        updated,
      });
      return Y.encodeStateAsUpdate(doc);
    };

    it("drops expired tombstones without saving, and the next edit's save omits them", async () => {
      const saves: Uint8Array[] = [];
      const stored = stateWith(Date.now() - 12 * 60 * 60 * 1000);
      const db = {
        load: () => Promise.resolve(stored),
        save: (_id: string, state: Uint8Array) => {
          saves.push(state);
          return Promise.resolve("owner");
        },
      };
      const bus = new MemoryBus();
      const b = new YjsBoardHub(db, bus);
      const a = new YjsBoardHub(db, bus, timing);
      expect(await b.transact("b1", (s) => s.all("page:main").length)).toBe(2);

      setSystemTime(new Date(Date.now() + DAY + 12 * 60 * 60 * 1000));
      try {
        expect(await a.transact("b1", (s) => s.all("page:main").length)).toBe(
          1
        );
      } finally {
        setSystemTime();
      }
      await settle();
      expect(await b.transact("b1", (s) => s.all("page:main").length)).toBe(1);

      await sleep(60);
      expect(saves).toHaveLength(0);

      await a.transact("b1", (s) =>
        s.put("page:main", { id: "fresh", version: 1 } as never)
      );
      await sleep(60);
      expect(saves).toHaveLength(1);
      const saved = new Y.Doc();
      Y.applyUpdate(saved, saves[0] as Uint8Array);
      expect([...saved.getMap("elements").keys()].sort()).toEqual([
        "page:main:fresh",
        "page:main:live",
      ]);
      await a.discard("b1");
      await b.discard("b1");
    });
  });
});

describe("YjsBoardHub eviction", () => {
  const recordingStore = () => {
    const saved: Uint8Array[] = [];
    return {
      saved,
      store: {
        load: () => Promise.resolve(saved.at(-1) ?? null),
        save: (_id: string, state: Uint8Array) => {
          saved.push(state);
          return Promise.resolve("owner");
        },
      },
    };
  };
  const closing = (client: Client) => {
    const closed: { code?: number; reason?: string }[] = [];
    const peer: SyncPeer = {
      ...client.peer(),
      close: (code, reason) => {
        closed.push({ code, reason });
      },
    };
    return { closed, peer };
  };

  it("saves unsaved edits and closes peers on every instance with the trashed code", async () => {
    const { saved, store: shared } = recordingStore();
    const bus = new MemoryBus();
    const a = new YjsBoardHub(shared, bus);
    const b = new YjsBoardHub(shared, bus);
    const onA = new Client();
    const onB = new Client();
    const watchA = closing(onA);
    const watchB = closing(onB);
    onA.session = await a.connect("b1", watchA.peer, true);
    onB.session = await b.connect("b1", watchB.peer, true);
    await settle();
    onA.doc.getMap("elements").set("page:main:a", { id: "a" });
    await settle();
    expect(saved).toEqual([]);

    await a.evict("b1");
    await settle();

    const expected = [{ code: 4410, reason: "board-trashed" }];
    expect(watchA.closed).toEqual(expected);
    expect(watchB.closed).toEqual(expected);
    const stored = new Y.Doc();
    Y.applyUpdate(stored, saved.at(-1) ?? new Uint8Array());
    expect(stored.getMap("elements").get("page:main:a")).toEqual({ id: "a" });
    expect(bus.subscribers("sync:b1")).toBe(0);
  });

  it("lets a later load of the same board start from the saved state, and evicting twice is harmless", async () => {
    const { store: shared } = recordingStore();
    const hub = new YjsBoardHub(shared, new MemoryBus());
    const client = new Client();
    client.session = await hub.connect("b1", closing(client).peer, true);
    client.doc.getMap("elements").set("page:main:a", { id: "a" });
    await Promise.all([hub.evict("b1"), hub.evict("b1")]);
    await hub.evict("b1");
    expect(await hub.transact("b1", (s) => s.pages().length)).toBe(1);
    const elements = await hub.transact("b1", (s) =>
      s.all("page:main").map((e) => e.id)
    );
    expect(elements).toEqual(["a"]);
  });

  describe("when the store rejects the final save", () => {
    const flaky = () => {
      const saved: Uint8Array[] = [];
      let up = false;
      return {
        saved,
        recover: () => {
          up = true;
        },
        store: {
          load: () => Promise.resolve(saved.at(-1) ?? null),
          save: (_id: string, state: Uint8Array) => {
            if (!up) {
              return Promise.reject(new Error("db down"));
            }
            saved.push(state);
            return Promise.resolve("owner");
          },
        },
      };
    };
    const hasElement = (state: Uint8Array | undefined) => {
      const doc = new Y.Doc();
      Y.applyUpdate(doc, state ?? new Uint8Array());
      return doc.getMap("elements").get("page:main:a") !== undefined;
    };

    it("reports the eviction as failed, keeps the live doc, and saves it on retry", async () => {
      const { saved, recover, store: db } = flaky();
      const hub = new YjsBoardHub(db, new MemoryBus());
      const client = new Client();
      const watch = closing(client);
      client.session = await hub.connect("b1", watch.peer, true);
      client.doc.getMap("elements").set("page:main:a", { id: "a" });

      await expect(hub.evict("b1")).rejects.toThrow("unsaved changes");
      expect(watch.closed).toEqual([{ code: 4410, reason: "board-trashed" }]);
      expect(saved).toEqual([]);

      recover();
      await hub.evict("b1");
      expect(hasElement(saved.at(-1))).toBe(true);
      await hub.discard("b1");
    });

    it("keeps an idle room loaded until the store recovers, then saves it", async () => {
      const { saved, recover, store: db } = flaky();
      const hub = new YjsBoardHub(db, new MemoryBus(), {
        debounceMs: 5,
        maxDelayMs: 10,
        graceMs: 20,
      });
      await hub.transact("b1", (s) =>
        s.put("page:main", { id: "a", version: 1 } as never)
      );
      await sleep(80);
      expect(saved).toEqual([]);
      expect(await hub.transact("b1", (s) => s.all("page:main").length)).toBe(
        1
      );

      recover();
      await sleep(80);
      expect(saved.length).toBeGreaterThan(0);
      const doc = new Y.Doc();
      Y.applyUpdate(doc, saved.at(-1) ?? new Uint8Array());
      expect(doc.getMap("elements").size).toBe(1);
      await hub.discard("b1");
    });
  });
});
