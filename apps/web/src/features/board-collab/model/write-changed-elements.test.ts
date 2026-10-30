import { describe, expect, it } from "bun:test";

import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import * as Y from "yjs";

import { fakeClock } from "@/shared/lib/fake-clock";
import { createThrottleLatest } from "@/shared/lib/throttle-latest";

import { writeChangedElements } from "./write-changed-elements";

const ORIGIN = Symbol("test");

interface PendingScene {
  page: string;
  scene: readonly ExcalidrawElement[];
}

const rect = (id: string, version: number, x = 0) =>
  ({
    id,
    version,
    x,
    isDeleted: false,
    type: "rectangle",
  }) as unknown as ExcalidrawElement;

const setup = () => {
  const doc = new Y.Doc();
  const map = doc.getMap<ExcalidrawElement>("elements");
  let updates = 0;
  doc.on("update", () => {
    updates += 1;
  });
  const sent = new Map<string, number>();
  const writer = createThrottleLatest<PendingScene>(
    ({ page, scene }) => writeChangedElements(doc, page, scene, sent, ORIGIN),
    33,
    fakeClock()
  );
  return { doc, map, sent, writer, updates: () => updates };
};

describe("writeChangedElements", () => {
  it("writes only changed elements, once", () => {
    const { doc, map, sent, updates } = setup();
    const a = rect("a", 1);
    writeChangedElements(doc, "p1", [a, rect("b", 1)], sent, ORIGIN);
    expect(updates()).toBe(1);
    writeChangedElements(doc, "p1", [a, rect("b", 2, 5)], sent, ORIGIN);
    expect(updates()).toBe(2);
    expect(map.get("p1:b")?.version).toBe(2);
    writeChangedElements(doc, "p1", [a, rect("b", 2, 5)], sent, ORIGIN);
    expect(updates()).toBe(2);
  });

  it("stores a copy taken at write time, not the live object", () => {
    const { doc, map, sent } = setup();
    const a = rect("a", 1);
    writeChangedElements(doc, "p1", [a], sent, ORIGIN);
    Object.assign(a, { x: 99 });
    expect(map.get("p1:a")?.x).toBe(0);
  });

  it("lands an element mutated in place after push as its final state", () => {
    const { map, writer } = setup();
    const a = rect("a", 1);
    for (const scene of [[rect("first", 1)], [a]]) {
      writer.push({ page: "p1", scene });
    }
    Object.assign(a, { x: 42, version: 2 });
    writer.flush();
    expect(map.get("p1:a")).toMatchObject({ x: 42, version: 2 });
  });
});
