import type { Bounds } from "../element/bounds";
import type Scene from "../scene/scene";
import { effect } from "../signals/signals";

/** tile edge in viewport CSS px at the tile's own level */
export const TILE = 512;
/** visible elements needed before the static scene switches to tile compositing */
export const TILE_MIN_ELEMENTS = 1500;
/** a single diff touching more elements than this is an edit storm: tile
 * rasterization would thrash, so the static scene draws directly for a while */
const CHURN_DIFF_SIZE = 100;
const CHURN_SUPPRESS_FRAMES = 4;
const DEFAULT_TILE_BUDGET = 256;

type TileEntry = {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  /** lod level the tile was rastered at (scene tile edge = TILE / level) */
  level: number;
  tx: number;
  ty: number;
};

export const tileKey = (level: number, tx: number, ty: number) =>
  `${level}:${tx}:${ty}`;

/** LRU capacity; `window.__NDRAW_TILE_BUDGET` overrides, 0 disables tiles */
export const getTileBudget = (): number => {
  if (typeof window === "undefined") {
    return DEFAULT_TILE_BUDGET;
  }
  const value = (window as unknown as Record<string, unknown>).__NDRAW_TILE_BUDGET;
  return typeof value === "number" ? value : DEFAULT_TILE_BUDGET;
};

let frameCounter = 0;
let churnSuppressUntil = 0;

/** call once per static-scene render */
export const tickTileFrame = () => {
  frameCounter++;
};

/** true while a recent large diff makes tile rasterization counterproductive */
export const tilesSuppressed = () => frameCounter < churnSuppressUntil;
const cache = new Map<string, TileEntry>();

export const tileCache = {
  get(key: string): TileEntry | null {
    const entry = cache.get(key);
    if (!entry) {
      return null;
    }
    // re-insert to mark as most recently used
    cache.delete(key);
    cache.set(key, entry);
    return entry;
  },
  put(
    key: string,
    canvas: HTMLCanvasElement | OffscreenCanvas,
    level: number,
    tx: number,
    ty: number,
  ) {
    cache.delete(key);
    cache.set(key, { canvas, level, tx, ty });
    const budget = getTileBudget();
    while (budget > 0 && cache.size > budget) {
      cache.delete(cache.keys().next().value as string);
    }
  },
  /** drops every tile whose scene rect intersects `bounds`, at any level */
  invalidateBounds(bounds: Bounds) {
    for (const [key, entry] of cache) {
      const size = TILE / entry.level;
      const minX = entry.tx * size;
      const minY = entry.ty * size;
      if (
        bounds[0] < minX + size &&
        bounds[2] > minX &&
        bounds[1] < minY + size &&
        bounds[3] > minY
      ) {
        cache.delete(key);
      }
    }
  },
  clear() {
    cache.clear();
  },
  size() {
    return cache.size;
  },
};

/**
 * Keeps the tile cache in sync with scene diffs. Must run before the spatial
 * index applies the same diff: deletions lose their `lastBounds` entry on
 * apply, and their pre-diff bounds are exactly the region to invalidate.
 * Registered once per scene (effects flush synchronously inside
 * `triggerUpdate`, so no index query can interleave).
 */
export const attachTileInvalidator = (scene: Scene) => {
  let lastEpoch = 0;
  return effect(() => {
    const diffs = scene.diffAtom.getDiffSince(lastEpoch);
    const epoch = scene.diffAtom.changedEpoch;
    if (!diffs) {
      // history lost => we can't know what changed
      tileCache.clear();
      lastEpoch = epoch;
      return;
    }
    // an edit storm makes tile rasterization thrash: draw directly for a while
    let changed = 0;
    for (const diff of diffs) {
      changed += diff.upserted.length + diff.removed.length;
    }
    if (changed > CHURN_DIFF_SIZE) {
      churnSuppressUntil = frameCounter + CHURN_SUPPRESS_FRAMES;
    }
    if (tileCache.size() === 0) {
      lastEpoch = epoch;
      return;
    }
    const index = scene.spatialIndex;
    // deletions first, while their pre-diff bounds are still in lastBounds
    for (const diff of diffs) {
      for (const id of diff.removed) {
        const bounds = index.lastBounds.get(id);
        if (bounds) {
          tileCache.invalidateBounds(bounds);
        }
      }
    }
    // apply the diff so lastBounds becomes old ∪ new for upserted ids
    // (degenerate search = cheapest way to force the index's lazy sync)
    index.search({ x1: 0, y1: 0, x2: 0, y2: 0 }, 0);
    for (const diff of diffs) {
      for (const element of diff.upserted) {
        const bounds = index.lastBounds.get(element.id);
        if (bounds) {
          tileCache.invalidateBounds(bounds);
        }
      }
    }
    lastEpoch = epoch;
  }, [scene.diffAtom]);
};
