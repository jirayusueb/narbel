import { expect, test } from "bun:test";

import { byZOrder } from "./merge";

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
