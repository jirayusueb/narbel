import type { Element } from "../entities/Element";
import { elementBounds, union } from "./geometry";
import type { Bounds } from "./geometry";
import { outermostGroup } from "./groups";

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

const sortedBy = (items: ArrangeItem[], key: (item: ArrangeItem) => number) => {
  const copy = [...items];
  copy.sort((a, b) => key(a) - key(b));
  return copy;
};
const distribute = (items: ArrangeItem[], axis: Axis): Move[] => {
  const horizontal = axis === "horizontal";
  const lead = (b: Bounds) => (horizontal ? b.x : b.y);
  const size = (b: Bounds) => (horizontal ? b.width : b.height);
  const mid = (b: Bounds) => lead(b) + size(b) / 2;
  const move = (id: string, delta: number): Move =>
    horizontal ? { id, dx: delta, dy: 0 } : { id, dx: 0, dy: delta };
  const sorted = sortedBy(items, (i) => lead(i.bounds));
  const [head] = sorted;
  if (!head) {
    return [];
  }
  const first = lead(head.bounds);
  const end = Math.max(...sorted.map((i) => lead(i.bounds) + size(i.bounds)));
  const taken = sorted.reduce((sum, i) => sum + size(i.bounds), 0);
  const gap = (end - first - taken) / (sorted.length - 1);
  if (gap < 0) {
    const byMid = sortedBy(items, (i) => mid(i.bounds));
    const startAt = byMid.findIndex((i) => lead(i.bounds) === first);
    const endAt = byMid.findIndex(
      (i) => lead(i.bounds) + size(i.bounds) === end
    );
    const from = mid(byMid[startAt]?.bounds ?? head.bounds);
    const step =
      (mid(byMid[endAt]?.bounds ?? head.bounds) - from) / (byMid.length - 1);
    let centre = from;
    return byMid.map(({ id, bounds }, index) => {
      if (index === startAt || index === endAt) {
        return move(id, 0);
      }
      centre += step;
      return move(id, centre - mid(bounds));
    });
  }
  let cursor = first;
  return sorted.map(({ id, bounds }) => {
    const delta = cursor - lead(bounds);
    cursor += size(bounds) + gap;
    return move(id, delta);
  });
};

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

export interface Unit {
  key: string;
  members: Element[];
}

/** Like Excalidraw, a group is one unit under its outermost group id; an ungrouped element is its own. */
export const unitsOf = (elements: Element[]): Unit[] => {
  const units = new Map<string, Unit>();
  for (const e of elements) {
    const key = outermostGroup(e) ?? e.id;
    const unit = units.get(key);
    if (unit) {
      unit.members.push(e);
    } else {
      units.set(key, { key, members: [e] });
    }
  }
  return [...units.values()];
};

export const unitItem = (unit: Unit): ArrangeItem => ({
  id: unit.key,
  bounds: union(unit.members.map(elementBounds)),
});
