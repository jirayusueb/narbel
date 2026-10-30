import { union } from "./geometry";
import type { Bounds } from "./geometry";

export type Edge = "left" | "center" | "right" | "top" | "middle" | "bottom";
export type Axis = "horizontal" | "vertical";

export type Arrangement =
  | { kind: "align"; edge: Edge }
  | { kind: "distribute"; axis: Axis };

export interface ArrangeItem {
  id: string;
  bounds: Bounds;
}

export interface Move {
  id: string;
  dx: number;
  dy: number;
}

// below float noise, so a second run over an arranged selection yields no moves
const EPSILON = 1e-6;

const ALIGN: Record<Edge, (sel: Bounds, b: Bounds) => [number, number]> = {
  left: (sel, b) => [sel.x - b.x, 0],
  center: (sel, b) => [sel.x + sel.width / 2 - (b.x + b.width / 2), 0],
  right: (sel, b) => [sel.x + sel.width - (b.x + b.width), 0],
  top: (sel, b) => [0, sel.y - b.y],
  middle: (sel, b) => [0, sel.y + sel.height / 2 - (b.y + b.height / 2)],
  bottom: (sel, b) => [0, sel.y + sel.height - (b.y + b.height)],
};

const align = (items: ArrangeItem[], edge: Edge): Move[] => {
  const sel = union(items.map((i) => i.bounds));
  return items.map(({ id, bounds }) => {
    const [dx, dy] = ALIGN[edge](sel, bounds);
    return { id, dx, dy };
  });
};

// Excalidraw's rule: order by leading edge, keep the first and the selection's far edge, equal gaps between.
const distribute = (items: ArrangeItem[], axis: Axis): Move[] => {
  const horizontal = axis === "horizontal";
  const lead = (b: Bounds) => (horizontal ? b.x : b.y);
  const size = (b: Bounds) => (horizontal ? b.width : b.height);
  // sorted in place on a copy: the web app type-checks this file without lib toSorted
  const sorted = items.map((i) => i);
  sorted.sort((a, b) => lead(a.bounds) - lead(b.bounds));
  const [head] = sorted;
  if (!head) {
    return [];
  }
  const first = lead(head.bounds);
  const end = Math.max(...sorted.map((i) => lead(i.bounds) + size(i.bounds)));
  const taken = sorted.reduce((sum, i) => sum + size(i.bounds), 0);
  const gap = (end - first - taken) / (sorted.length - 1);
  let cursor = first;
  return sorted.map(({ id, bounds }) => {
    const delta = cursor - lead(bounds);
    cursor += size(bounds) + gap;
    return horizontal ? { id, dx: delta, dy: 0 } : { id, dx: 0, dy: delta };
  });
};

/** Only the elements that have to move, so arranging an arranged selection returns []. */
export const arrangeMoves = (
  items: ArrangeItem[],
  how: Arrangement
): Move[] => {
  if (items.length < 2) {
    return [];
  }
  const moves =
    how.kind === "align" ? align(items, how.edge) : distribute(items, how.axis);
  return moves.filter(
    (m) => Math.abs(m.dx) > EPSILON || Math.abs(m.dy) > EPSILON
  );
};
