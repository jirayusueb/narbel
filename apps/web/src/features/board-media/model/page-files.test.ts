import { expect, test } from "bun:test";

import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import * as Y from "yjs";

import { fileIdsOnPage } from "./page-files";

const el = (fields: object) => fields as ExcalidrawElement;

test("only live images on the given page need their files", () => {
  const elements = new Y.Doc().getMap<ExcalidrawElement>("elements");
  elements.set("p1:a", el({ type: "image", fileId: "f1" }));
  elements.set("p1:b", el({ type: "image", fileId: "f2", isDeleted: true }));
  elements.set("p1:c", el({ type: "rectangle" }));
  elements.set("p2:d", el({ type: "image", fileId: "f3" }));
  expect([...fileIdsOnPage(elements, "p1")]).toEqual(["f1"]);
  expect([...fileIdsOnPage(elements, "p2")]).toEqual(["f3"]);
});
