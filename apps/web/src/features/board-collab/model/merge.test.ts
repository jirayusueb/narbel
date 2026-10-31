import { expect, test } from "bun:test";

import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import * as Y from "yjs";

import { byZOrder, incomingFor, outranking } from "./merge";

test("orders a scene by fractional index whatever order the shared map yields", () => {
  // a reloaded Y.Map iterates by CRDT client, not by z-order
  const fromMap = [
    { id: "top", index: "a2" },
    { id: "legacy", index: null },
    { id: "bottom", index: "a0" },
    { id: "tie-b", index: "a1" },
    { id: "tie-a", index: "a1" },
    { id: "label", index: "a0V" },
  ];
  fromMap.sort(byZOrder);
  expect(fromMap.map((e) => e.id)).toEqual([
    "bottom",
    "label",
    "tie-a",
    "tie-b",
    "top",
    "legacy",
  ]);
});

const el = (id: string, version: number, isDeleted = false) =>
  ({ id, version, versionNonce: 1, isDeleted }) as unknown as ExcalidrawElement;

const run = (
  keys: string[],
  remote: Record<string, ExcalidrawElement>,
  shown: ExcalidrawElement[]
) =>
  incomingFor(
    "p1",
    keys,
    (key) => remote[key],
    new Map(shown.map((e) => [e.id, e]))
  );

test("takes a remote value newer than the local one", () => {
  const out = run(["p1:a"], { "p1:a": el("a", 3) }, [el("a", 2)]);
  expect(out.map((e) => e.version)).toEqual([3]);
});

test("a key missing from the map deletes a live element at the same version", () => {
  const out = run(["p1:a"], {}, [el("a", 5)]);
  expect(out).toHaveLength(1);
  expect(out[0]).toMatchObject({ id: "a", version: 5, isDeleted: true });
});

test("a key missing from the map changes nothing for an already deleted element", () => {
  expect(run(["p1:a"], {}, [el("a", 5, true)])).toEqual([]);
});

test("a key missing from the map changes nothing for an element not shown", () => {
  expect(run(["p1:a"], {}, [])).toEqual([]);
});

test("skips keys of another page", () => {
  const out = run(["p2:a"], { "p2:a": el("a", 9) }, [el("a", 1)]);
  expect(out).toEqual([]);
});

const sync = (a: Y.Doc, b: Y.Doc) => {
  Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
};

test.each([
  [1, 2],
  [2, 1],
])(
  "a restore and an offline higher-version edit of one key end up identical on both sides (server id %i, client id %i)",
  (serverId, clientId) => {
    const server = new Y.Doc();
    const client = new Y.Doc();
    server.clientID = serverId;
    client.clientID = clientId;
    const serverMap = server.getMap<ExcalidrawElement>("elements");
    const clientMap = client.getMap<ExcalidrawElement>("elements");
    serverMap.set("p1:a", el("a", 1));
    sync(server, client);
    clientMap.set("p1:a", el("a", 5));
    serverMap.set("p1:a", el("a", 3));
    sync(server, client);

    const canvas = new Map([["a", el("a", 5)]]);
    const winners = outranking(
      "p1",
      ["p1:a"],
      (key) => clientMap.get(key),
      canvas,
      true
    );
    // whichever id order Yjs used, the canvas ends up showing v5 and the document must agree
    client.transact(() => {
      for (const { key, element } of winners) {
        clientMap.set(key, { ...element });
      }
    });
    sync(server, client);

    expect(serverMap.get("p1:a")?.version).toBe(5);
    expect(clientMap.get("p1:a")?.version).toBe(5);
  }
);

test("outranking ignores other pages, missing keys and elements the document already beats", () => {
  const remote: Record<string, ExcalidrawElement> = {
    "p1:a": el("a", 4),
    "p2:b": el("b", 1),
  };
  const canvas = new Map([
    ["a", el("a", 4)],
    ["b", el("b", 9)],
    ["c", el("c", 9)],
  ]);
  expect(
    outranking(
      "p1",
      ["p1:a", "p2:b", "p1:c"],
      (key) => remote[key],
      canvas,
      true
    )
  ).toEqual([]);
});

test("a version restore replaces a local tombstone whose version is higher", () => {
  const remote = { "p1:a": el("a", 3) };
  const canvas = new Map([["a", el("a", 10, true)]]);
  const get = (key: string) => remote[key as "p1:a"];
  expect(incomingFor("p1", ["p1:a"], get, canvas)).toEqual([]);
  expect(incomingFor("p1", ["p1:a"], get, canvas, true)).toEqual([
    remote["p1:a"],
  ]);
});

test("a client that cannot write never writes a winner back into the document", () => {
  const remote = { "p1:a": el("a", 1) };
  const canvas = new Map([["a", el("a", 5)]]);
  const get = (key: string) => remote[key as "p1:a"];
  expect(outranking("p1", ["p1:a"], get, canvas, true)).toHaveLength(1);
  expect(outranking("p1", ["p1:a"], get, canvas, false)).toEqual([]);
});
