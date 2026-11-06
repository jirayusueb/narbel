import { isLinearElement, resolveArrowBindings } from "@narbel/ndraw";
import type {
  ExcalidrawElement,
  OrderedExcalidrawElement,
} from "@narbel/ndraw/element/types";

/**
 * Arrows written by the server (MCP agents) carry endpoints approximated from the shapes' boxes, and
 * an arrow can arrive before or after the shape it binds to moves. Re-attach the given ids' bound
 * arrows, and the arrows bound to the given ids, to their shapes' real outlines.
 * Like `measureText`, the result is local: the version is left alone and nothing is written back.
 * Arrows already on their targets are returned as the same object.
 */
export const resolveBindings = (
  scene: readonly OrderedExcalidrawElement[],
  ids: ReadonlySet<string>
): OrderedExcalidrawElement[] => {
  const map = new Map<string, ExcalidrawElement>(
    scene.map((el) => [el.id, el])
  );
  const arrows = new Set<string>();
  for (const id of ids) {
    const el = map.get(id);
    if (!el) {
      continue;
    }
    if (isLinearElement(el) && (el.startBinding || el.endBinding)) {
      arrows.add(id);
    }
    for (const bound of el.boundElements ?? []) {
      if (bound.type === "arrow") {
        arrows.add(bound.id);
      }
    }
  }
  if (arrows.size === 0) {
    return [...scene];
  }
  return scene.map((el) => {
    if (!(arrows.has(el.id) && isLinearElement(el))) {
      return el;
    }
    const resolved = resolveArrowBindings(el, map);
    return resolved ? { ...el, ...resolved } : el;
  });
};
