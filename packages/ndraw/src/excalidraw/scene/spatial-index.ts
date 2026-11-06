import Flatbush from "flatbush";
import RBush from "rbush";

import { getElementBounds } from "../element";
import type { Bounds } from "../element/bounds";
import type { ExcalidrawElement } from "../element/types";
import { Computed } from "../signals/signals";
import Scene from "./scene";
import type { SceneDiff } from "./scene";

type IndexItem = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  id: string;
};

// rebuild the (immutable) flatbush base once this many of its entries went
// stale, or once this many live updates piled up in the rbush delta
const REBUILD_STALE_LIMIT = 500;
const REBUILD_DELTA_LIMIT = 2000;

export type SpatialQuery =
  | { x: number; y: number }
  | { x1: number; y1: number; x2: number; y2: number };

const itemOf = (id: string, b: Bounds): IndexItem => ({
  minX: b[0],
  minY: b[1],
  maxX: b[2],
  maxY: b[3],
  id,
});

const unionBounds = (a: Bounds, b: Bounds): Bounds => [
  Math.min(a[0], b[0]),
  Math.min(a[1], b[1]),
  Math.max(a[2], b[2]),
  Math.max(a[3], b[3]),
];

export class SpatialIndex {
  /** immutable snapshot of the scene at the last rebuild */
  private base: Flatbush | null = null;
  private baseItems: IndexItem[] = [];
  /** element per base entry, valid until the next mutation (any change leaves the fast path) */
  private baseElements: ExcalidrawElement[] = [];
  private baseIds = new Set<string>();
  /** base entries whose element changed after the rebuild (bounds are stale) */
  private staleBaseIds = new Set<string>();
  /** live updates since the last rebuild */
  private delta = new RBush<IndexItem>();
  private deltaItems = new Map<string, IndexItem>();
  private deltaCount = 0;
  /** element bounds (old ∪ new after moves) — consumed by tile invalidation */
  readonly lastBounds = new Map<string, Bounds>();
  /** id -> z, rebuilt lazily after each apply (diffs may reorder elements) */
  private zOrder: Map<string, number> | null = null;
  private lastEpoch = 0;
  /** applies pending diffs only when something read the index since */
  private readonly sync: Computed<null>;

  constructor(private readonly scene: Scene) {
    this.sync = new Computed(
      () => {
        const diffs = this.scene.diffAtom.getDiffSince(this.lastEpoch);
        if (!diffs) {
          // history lost (or never applied) => full rebuild
          this.rebuild();
        } else {
          for (const diff of diffs) {
            this.apply(diff);
          }
        }
        this.lastEpoch = this.scene.diffAtom.changedEpoch;
        return null;
      },
      [this.scene.diffAtom],
    );
  }

  /** Bring the index up to date with the scene. Callers then use `search`. */
  apply(diff: SceneDiff) {
    const elementsMap = this.scene.getNonDeletedElementsMap();
    for (const element of diff.upserted) {
      const live = elementsMap.get(element.id) ?? element;
      const b = getElementBounds(live, elementsMap);
      const prevItem = this.deltaItems.get(element.id);
      if (prevItem) {
        this.delta.remove(prevItem);
        this.deltaCount--;
      }
      const item = itemOf(element.id, b);
      this.delta.insert(item);
      this.deltaCount++;
      this.deltaItems.set(element.id, item);
      const prevBounds = this.lastBounds.get(element.id);
      this.lastBounds.set(
        element.id,
        prevBounds ? unionBounds(prevBounds, b) : b,
      );
      if (this.baseIds.has(element.id)) {
        this.staleBaseIds.add(element.id);
      }
    }
    for (const id of diff.removed) {
      const item = this.deltaItems.get(id);
      if (item) {
        this.delta.remove(item);
        this.deltaCount--;
        this.deltaItems.delete(id);
      }
      this.lastBounds.delete(id);
      if (this.baseIds.has(id)) {
        this.staleBaseIds.add(id);
      }
    }
    this.zOrder = null;
    if (
      this.staleBaseIds.size > REBUILD_STALE_LIMIT ||
      this.deltaCount > REBUILD_DELTA_LIMIT
    ) {
      this.rebuild();
    }
  }

  private rebuild() {
    const elements = this.scene.getNonDeletedElements();
    const elementsMap = this.scene.getNonDeletedElementsMap();
    this.base = elements.length ? new Flatbush(elements.length) : null;
    this.baseItems = [];
    this.baseElements = [];
    this.baseIds = new Set();
    this.delta.clear();
    this.deltaItems.clear();
    this.deltaCount = 0;
    this.staleBaseIds.clear();
    this.zOrder = null;
    if (!this.base) {
      return;
    }
    for (const element of elements) {
      const b = getElementBounds(element, elementsMap);
      this.base.add(b[0], b[1], b[2], b[3]);
      this.baseItems.push(itemOf(element.id, b));
      this.baseElements.push(element);
      this.baseIds.add(element.id);
      this.lastBounds.set(element.id, b);
    }
    this.base.finish();
  }

  /**
   * Elements whose indexed bounds intersect the query (expanded by `pad`),
   * in scene z order (ascending). Superset of any hit predicate reachable
   * within `pad` — callers run their exact per-candidate test as before.
   */
  search(query: SpatialQuery, pad = 0): ExcalidrawElement[] {
    this.sync.get();
    const minX = ("x1" in query ? query.x1 : query.x) - pad;
    const minY = ("y1" in query ? query.y1 : query.y) - pad;
    const maxX = ("x2" in query ? query.x2 : query.x) + pad;
    const maxY = ("y2" in query ? query.y2 : query.y) + pad;

    const elementsMap = this.scene.getNonDeletedElementsMap();
    const out: ExcalidrawElement[] = [];
    // after a rebuild the delta is empty and every live element is in the base:
    // skip the delta tree and the dedupe set entirely
    if (this.deltaCount === 0 && this.staleBaseIds.size === 0 && this.base) {
      const indices = this.base.search(minX, minY, maxX, maxY);
      for (let i = 0; i < indices.length; i++) {
        out.push(this.baseElements[indices[i]]);
      }
    } else {
      const seen = new Set<string>();
      if (this.base) {
        const indices = this.base.search(minX, minY, maxX, maxY);
        for (const index of indices) {
          const item = this.baseItems[index];
          if (!item || this.staleBaseIds.has(item.id) || seen.has(item.id)) {
            continue;
          }
          const element = elementsMap.get(item.id);
          if (element) {
            seen.add(item.id);
            out.push(element);
          }
        }
      }
      for (const item of this.delta.search({ minX, minY, maxX, maxY })) {
        if (seen.has(item.id)) {
          continue;
        }
        const element = elementsMap.get(item.id);
        if (element) {
          seen.add(item.id);
          out.push(element);
        }
      }
    }

    if (out.length > 1) {
      // decorate once instead of two map lookups per comparison
      const z = this.getZOrder();
      const decorated = out.map(
        (element) => [z.get(element.id) ?? 0, element] as const
      );
      decorated.sort((a, b) => a[0] - b[0]);
      for (let i = 0; i < decorated.length; i++) {
        out[i] = decorated[i][1];
      }
    }
    return out;
  }

  private getZOrder(): Map<string, number> {
    if (!this.zOrder) {
      this.zOrder = new Map();
      const elements = this.scene.getNonDeletedElements();
      for (let i = 0; i < elements.length; i++) {
        this.zOrder.set(elements[i].id, i);
      }
    }
    return this.zOrder;
  }
}

/**
 * Index-backed candidate list for query sites that received an `elements`
 * array. Falls back to that array (today's linear scan) when the caller
 * passed a subset — the identity guard — or the elements have no scene.
 */
export const indexCandidates = (
  elements: readonly ExcalidrawElement[],
  query: SpatialQuery,
  pad = 0,
): readonly ExcalidrawElement[] => {
  const anchor = elements.length
    ? elements[elements.length - 1]
    : (query as unknown as ExcalidrawElement);
  const scene = anchor ? Scene.getScene(anchor) : null;
  if (scene && elements === scene.getNonDeletedElements()) {
    return scene.spatialIndex.search(query, pad);
  }
  return elements;
};
