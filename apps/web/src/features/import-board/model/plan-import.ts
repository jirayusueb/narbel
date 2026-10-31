import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { BinaryFileData, BinaryFiles } from "@excalidraw/excalidraw/types";

const TITLE_MAX_LENGTH = 120;
const FALLBACK_TITLE = "Imported board";

export const importTitle = (filename: string) =>
  filename
    .replace(/\.(?:excalidraw|json)$/iu, "")
    .trim()
    .slice(0, TITLE_MAX_LENGTH)
    .trim() || FALLBACK_TITLE;

export interface ImportPlan {
  /** live elements only, ids and bindings untouched */
  elements: ExcalidrawElement[];
  /** every file a live image element references and the document carries bytes for */
  images: BinaryFileData[];
}

export const planImport = (scene: {
  elements: readonly ExcalidrawElement[];
  files: BinaryFiles;
}): ImportPlan => {
  const elements = scene.elements.filter((e) => !e.isDeleted);
  if (elements.length === 0) {
    throw new Error("The file has no drawing in it");
  }
  const wanted = new Set<string>();
  for (const element of elements) {
    if (element.type === "image" && element.fileId) {
      wanted.add(element.fileId);
    }
  }
  const images: BinaryFileData[] = [];
  const missing: string[] = [];
  for (const id of wanted) {
    const file = scene.files[id];
    if (file) {
      images.push(file);
    } else {
      missing.push(id);
    }
  }
  if (missing.length > 0) {
    throw new Error(
      `${missing.length} image${missing.length === 1 ? " has" : "s have"} no data in the file`
    );
  }
  return { elements, images };
};
