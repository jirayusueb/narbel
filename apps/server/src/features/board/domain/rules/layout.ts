import { union } from "./geometry";
import type { Bounds } from "./geometry";

export const FRAME_PADDING = 40;

/** Where a new auto-laid-out group starts: right of everything in `fixed`, at its top edge. */
export const besideContent = (
  fixed: Bounds[],
  clearance: number
): { left: number; top: number } =>
  fixed.length === 0
    ? { left: 0, top: 0 }
    : {
        left: Math.max(...fixed.map((b) => b.x + b.width)) + clearance,
        top: Math.min(...fixed.map((b) => b.y)),
      };

/** A frame fitted around its children: their union plus FRAME_PADDING on every side. */
export const wrapFrame = (children: Bounds[]): Bounds => {
  const inner = union(children);
  return {
    x: inner.x - FRAME_PADDING,
    y: inner.y - FRAME_PADDING,
    width: inner.width + 2 * FRAME_PADDING,
    height: inner.height + 2 * FRAME_PADDING,
  };
};

export type LayoutDirection = "down" | "right";

export interface LayoutNode {
  id: string;
  width: number;
  height: number;
}

export interface LayoutEdge {
  from: string;
  to: string;
  /** size of the text sitting on the edge; the rank gap grows to keep the line visible around it */
  label?: { width: number; height: number };
}

const RANK_GAP = 80;
const NODE_GAP = 40;
// shortcut: only labels on edges between adjacent ranks widen a gap, an edge skipping ranks does not
// line kept visible on each side of a label; an arrow stops BINDING_GAP short of each shape
const LABEL_MARGIN = 24;
const BINDING_GAP = 8;

/** Forward edges per node, dropping the ones that would close a cycle, and a topological order. */
const acyclic = (nodes: LayoutNode[], edges: LayoutEdge[]) => {
  const out = new Map(nodes.map((n) => [n.id, [] as string[]]));
  for (const { from, to } of edges) {
    if (from !== to && out.has(to)) {
      out.get(from)?.push(to);
    }
  }
  const forward = new Map(nodes.map((n) => [n.id, [] as string[]]));
  const state = new Map<string, "open" | "done">();
  const postorder: string[] = [];
  const visit = (id: string) => {
    state.set(id, "open");
    for (const next of out.get(id) ?? []) {
      if (state.get(next) !== "open") {
        forward.get(id)?.push(next);
        if (!state.has(next)) {
          visit(next);
        }
      }
    }
    state.set(id, "done");
    postorder.push(id);
  };
  for (const node of nodes) {
    if (!state.has(node.id)) {
      visit(node.id);
    }
  }
  // reversed postorder of the acyclic edges is a topological order
  postorder.reverse();
  return { forward, order: postorder };
};

/** Nodes grouped into ranks by longest path from a source, ordered to keep edges short. */
const layers = (nodes: LayoutNode[], edges: LayoutEdge[]) => {
  const { forward, order } = acyclic(nodes, edges);
  const rank = new Map(nodes.map((n) => [n.id, 0]));
  const preds = new Map(nodes.map((n) => [n.id, [] as string[]]));
  for (const id of order) {
    for (const next of forward.get(id) ?? []) {
      rank.set(next, Math.max(rank.get(next) ?? 0, (rank.get(id) ?? 0) + 1));
      preds.get(next)?.push(id);
    }
  }
  const grouped: LayoutNode[][] = [];
  for (const node of nodes) {
    (grouped[rank.get(node.id) ?? 0] ??= []).push(node);
  }
  const ranks = grouped.filter(Boolean);
  // one barycenter sweep: each node sits under the mean slot of its predecessors
  const slot = new Map<string, number>();
  for (const layer of ranks) {
    const key = (node: LayoutNode, index: number) => {
      const placed = (preds.get(node.id) ?? []).filter((p) => slot.has(p));
      return placed.length === 0
        ? index
        : placed.reduce((sum, p) => sum + (slot.get(p) ?? 0), 0) /
            placed.length;
    };
    const keyed = layer.map((node, index) => ({ node, key: key(node, index) }));
    keyed.sort((a, b) => a.key - b.key);
    const sorted = keyed.map(({ node }) => node);
    for (const [index, node] of sorted.entries()) {
      slot.set(node.id, index);
    }
    layer.splice(0, layer.length, ...sorted);
  }
  return ranks;
};

/**
 * Top-left position of every node in a layered (flowchart) layout starting at 0,0:
 * edges point down or right, each rank is centered on the widest one.
 */
export const layered = (
  nodes: LayoutNode[],
  edges: LayoutEdge[],
  direction: LayoutDirection
): Map<string, { x: number; y: number }> => {
  const down = direction === "down";
  const along = (n: LayoutNode) => (down ? n.height : n.width);
  const across = (n: LayoutNode) => (down ? n.width : n.height);
  const span = (layer: LayoutNode[]) =>
    layer.reduce((sum, n) => sum + across(n), 0) +
    NODE_GAP * (layer.length - 1);
  const ranks = layers(nodes, edges);
  const rankOf = new Map(
    ranks.flatMap((layer, index) => layer.map((n) => [n.id, index] as const))
  );
  const gaps = ranks.map(() => RANK_GAP);
  for (const { from, to, label } of edges) {
    const at = rankOf.get(from);
    if (label && at !== undefined && rankOf.get(to) === at + 1) {
      const need =
        (down ? label.height : label.width) + 2 * (LABEL_MARGIN + BINDING_GAP);
      gaps[at] = Math.max(gaps[at] ?? RANK_GAP, need);
    }
  }
  const widest = Math.max(...ranks.map(span));
  const positions = new Map<string, { x: number; y: number }>();
  let main = 0;
  for (const [index, layer] of ranks.entries()) {
    const thickness = Math.max(...layer.map(along));
    let cross = (widest - span(layer)) / 2;
    for (const node of layer) {
      const offset = main + (thickness - along(node)) / 2;
      positions.set(
        node.id,
        down ? { x: cross, y: offset } : { x: offset, y: cross }
      );
      cross += across(node) + NODE_GAP;
    }
    main += thickness + (gaps[index] ?? RANK_GAP);
  }
  return positions;
};
