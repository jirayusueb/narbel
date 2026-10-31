import { describe, expect, test } from "bun:test";

import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { BinaryFileData } from "@excalidraw/excalidraw/types";

import { importTitle, planImport } from "./plan-import";

const el = (fields: object) => fields as ExcalidrawElement;
const file = (id: string) =>
  ({
    id,
    mimeType: "image/png",
    dataURL: "data:image/png;base64,AA==",
    created: 1,
  }) as BinaryFileData;

describe("planImport", () => {
  test("keeps live elements as they are and returns only the files they use", () => {
    const rect = el({ id: "r", type: "rectangle" });
    const arrow = el({
      id: "a",
      type: "arrow",
      startBinding: { elementId: "r", focus: 0, gap: 1 },
    });
    const plan = planImport({
      elements: [
        rect,
        arrow,
        el({ id: "i", type: "image", fileId: "f1" }),
        el({ id: "x", type: "image", fileId: "f2", isDeleted: true }),
      ],
      files: { f1: file("f1"), f2: file("f2") },
    });
    expect(plan.elements.map((e) => e.id)).toEqual(["r", "a", "i"]);
    expect(plan.elements[1]).toBe(arrow);
    expect(plan.images.map((f) => String(f.id))).toEqual(["f1"]);
  });

  test("refuses a file whose image has no bytes instead of importing a broken placeholder", () => {
    expect(() =>
      planImport({
        elements: [
          el({ id: "i", type: "image", fileId: "gone" }),
          el({ id: "j", type: "image", fileId: "gone" }),
        ],
        files: {},
      })
    ).toThrow("1 image has no data");
  });

  test("ignores a deleted image whose bytes are absent", () => {
    const plan = planImport({
      elements: [
        el({ id: "r", type: "rectangle" }),
        el({ id: "x", type: "image", fileId: "gone", isDeleted: true }),
      ],
      files: {},
    });
    expect(plan.images).toEqual([]);
  });

  test("refuses a file with no live element instead of making an empty board", () => {
    expect(() =>
      planImport({
        elements: [el({ id: "x", type: "rectangle", isDeleted: true })],
        files: {},
      })
    ).toThrow("no drawing");
  });
});

describe("importTitle", () => {
  test.each([
    ["Roadmap.excalidraw", "Roadmap"],
    ["notes.v2.json", "notes.v2"],
    ["  .excalidraw", "Imported board"],
    [`${"a".repeat(130)}.excalidraw`, "a".repeat(120)],
  ])("%s becomes %s", (name, title) => {
    expect(importTitle(name)).toBe(title);
  });
});
