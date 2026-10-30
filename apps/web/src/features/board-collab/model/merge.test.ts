import { expect, test } from "bun:test";

import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";

import { byZOrder, incomingFor } from "./merge";

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
