import { describe, expect, it } from "bun:test";

import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";
import * as awarenessProtocol from "y-protocols/awareness";
import * as syncProtocol from "y-protocols/sync";
import * as Y from "yjs";

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

    await hub.setSelection("b1", ["m"]);
    expect(await hub.getSelection("b1")).toEqual(["m"]);
    const states = [...editor.awareness.getStates().values()];
    expect(states.some((state) => state.mcp === true)).toBe(true);
  });

  it("has no selection while nobody is connected", async () => {
    expect(
      await new YjsBoardHub(store, new MemoryBus()).getSelection("b1")
    ).toBeUndefined();
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
