import {
  getContainerElement,
  isTextElement,
  refreshTextDimensions,
} from "@narbel/ndraw";
import type {
  ExcalidrawElement,
  OrderedExcalidrawElement,
} from "@narbel/ndraw/element/types";

/**
 * Text written by the server (MCP agents) carries sizes estimated without the real fonts, so
 * Excalidraw draws its box and label offset wrong until someone edits it. Re-measure the given
 * ids against the loaded fonts, using the whole scene to find each label's container.
 * The version is left alone: the corrected size is local and never written back as an edit.
 * An element whose measured size already matches is returned as the same object.
 */
export const measureText = (
  scene: readonly OrderedExcalidrawElement[],
  ids: ReadonlySet<string>
): OrderedExcalidrawElement[] => {
  const map = new Map<string, ExcalidrawElement>(
    scene.map((el) => [el.id, el])
  );
  return scene.map((el) => {
    if (!(ids.has(el.id) && isTextElement(el))) {
      return el;
    }
    const next = refreshTextDimensions(el, getContainerElement(el, map), map);
    const unchanged =
      !next ||
      (next.text === el.text &&
        next.width === el.width &&
        next.height === el.height &&
        next.x === el.x &&
        next.y === el.y);
    return unchanged ? el : { ...el, ...next };
  });
};
