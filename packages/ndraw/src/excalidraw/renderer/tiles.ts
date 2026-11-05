import type { Bounds } from "../element/bounds";
import type { ElementsMap, ExcalidrawElement, Theme } from "../element/types";
import { isTextElement } from "../element/type-checks";
import { WorkerInTheMainChunkError, WorkerUrlNotDefinedError } from "../errors";
import { Fonts } from "../fonts";
import { perf } from "../perf/performance-manager";
import type Scene from "../scene/scene";
import { effect } from "../signals/signals";
import { isRTL } from "../utils";
import type {
  TileWorkerFace,
  TileWorkerRequest,
  TileWorkerResponse,
} from "./tile-worker.chunk";

/** tile edge in viewport CSS px at the tile's own level */
export const TILE = 512;
/** visible elements needed before the static scene switches to tile compositing */
export const TILE_MIN_ELEMENTS = 1500;
/** a single diff touching more elements than this is an edit storm: tile
 * rasterization would thrash, so the static scene draws directly for a while */
const CHURN_DIFF_SIZE = 100;
const CHURN_SUPPRESS_FRAMES = 4;
const DEFAULT_TILE_BUDGET = 256;
/** raster jobs the worker may have queued; more misses rasterize on main */
const MAX_INFLIGHT_JOBS = 24;

type TileCanvas = HTMLCanvasElement | OffscreenCanvas | ImageBitmap;

type TileEntry = {
  canvas: TileCanvas;
  /** lod level the tile was rastered at (scene tile edge = TILE / level) */
  level: number;
  tx: number;
  ty: number;
};

/** a tile the worker is rastering (inflight) or refused to raster (mainOnly) */
type TileSlot = { jobId: number; level: number; tx: number; ty: number };

export const tileKey = (level: number, tx: number, ty: number) =>
  `${level}:${tx}:${ty}`;

const readWindowFlag = (name: string): unknown =>
  typeof window === "undefined"
    ? undefined
    : (window as unknown as Record<string, unknown>)[name];

/** LRU capacity; `window.__NDRAW_TILE_BUDGET` overrides, 0 disables tiles */
export const getTileBudget = (): number => {
  const value = readWindowFlag("__NDRAW_TILE_BUDGET");
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

/**
 * Staleness design (no resurrection): every posted job gets a fresh `jobId`
 * stored in `inflight[key]`. Anything that invalidates the tile (a scene diff
 * touching its rect, `clear()`, or a main-thread raster `put`) deletes that
 * entry, so the late reply no longer matches and its bitmap is discarded.
 */
const inflight = new Map<string, TileSlot>();
const mainOnly = new Map<string, TileSlot>();

const tileIntersects = (
  bounds: Bounds,
  { level, tx, ty }: Pick<TileSlot, "level" | "tx" | "ty">,
) => {
  const size = TILE / level;
  const minX = tx * size;
  const minY = ty * size;
  return (
    bounds[0] < minX + size &&
    bounds[2] > minX &&
    bounds[1] < minY + size &&
    bounds[3] > minY
  );
};

const release = (entry: TileEntry) => {
  if ("close" in entry.canvas) {
    entry.canvas.close();
  }
};

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
  put(key: string, canvas: TileCanvas, level: number, tx: number, ty: number) {
    // a fresh authoritative tile supersedes any worker job for the same key
    inflight.delete(key);
    const previous = cache.get(key);
    if (previous) {
      release(previous);
    }
    cache.delete(key);
    cache.set(key, { canvas, level, tx, ty });
    const budget = getTileBudget();
    while (budget > 0 && cache.size > budget) {
      const oldest = cache.keys().next().value as string;
      release(cache.get(oldest)!);
      cache.delete(oldest);
    }
  },
  /** drops every tile whose scene rect intersects `bounds`, at any level */
  invalidateBounds(bounds: Bounds) {
    for (const [key, entry] of cache) {
      if (tileIntersects(bounds, entry)) {
        release(entry);
        cache.delete(key);
      }
    }
    for (const slots of [inflight, mainOnly]) {
      for (const [key, slot] of slots) {
        if (tileIntersects(bounds, slot)) {
          slots.delete(key);
        }
      }
    }
  },
  clear() {
    for (const entry of cache.values()) {
      release(entry);
    }
    cache.clear();
    inflight.clear();
    mainOnly.clear();
  },
  size() {
    return cache.size;
  },
};

// ---------------------------------------------------------------------------
// worker raster path
// ---------------------------------------------------------------------------

type WorkerState = { worker: Worker; fontsOk: boolean };

let workerState: WorkerState | null = null;
let workerBooting = false;
let workerDisabled = false;
let jobSeq = 0;
let onTileReady: (() => void) | null = null;

/** called when the cache changed outside a render (a worker tile landed) */
export const setTileReadyListener = (listener: (() => void) | null) => {
  onTileReady = listener;
};

const workerWanted = () =>
  !workerDisabled &&
  getTileBudget() > 0 &&
  readWindowFlag("__NDRAW_TILE_WORKER") !== false &&
  typeof Worker !== "undefined" &&
  typeof OffscreenCanvas !== "undefined";

/** any worker failure is permanent: tiles go back to main-thread rasters */
const disableWorker = (reason: unknown) => {
  if (workerDisabled) {
    return;
  }
  workerDisabled = true;
  workerState?.worker.terminate();
  workerState = null;
  inflight.clear();
  // eslint-disable-next-line no-console
  console.warn("[ndraw] tile worker disabled, rastering tiles on main", reason);
  onTileReady?.();
};

// same face list the document registers (fonts/fonts.ts), as plain data
const collectFontFaces = (): TileWorkerFace[] => {
  const faces: TileWorkerFace[] = [];
  for (const { fontFaces, metadata } of Fonts.registered.values()) {
    if (metadata.local) {
      continue;
    }
    for (const { fontFace, urls } of fontFaces) {
      if (urls.length === 0) {
        continue;
      }
      faces.push({
        family: fontFace.family,
        src: (urls as Array<URL | string>).map((url) => `url(${url})`).join(", "),
        descriptors: {
          style: fontFace.style,
          weight: fontFace.weight,
          unicodeRange: fontFace.unicodeRange,
          display: fontFace.display as FontDisplay,
        },
      });
    }
  }
  return faces;
};

const onWorkerMessage = (event: MessageEvent<TileWorkerResponse>) => {
  const message = event.data;
  switch (message.type) {
    case "fonts-ready":
      if (workerState) {
        workerState.fontsOk = message.ok;
      }
      return;
    case "tile": {
      const slot = inflight.get(message.tileKey);
      if (!slot || slot.jobId !== message.jobId) {
        message.bitmap.close();
        return;
      }
      tileCache.put(message.tileKey, message.bitmap, slot.level, slot.tx, slot.ty);
      perf.count("tileRasterWorkerMs", message.ms);
      onTileReady?.();
      return;
    }
    case "unsupported": {
      const slot = inflight.get(message.tileKey);
      if (slot && slot.jobId === message.jobId) {
        inflight.delete(message.tileKey);
        mainOnly.set(message.tileKey, slot);
        onTileReady?.();
      }
      return;
    }
    case "error":
      disableWorker(message.message);
  }
};

const bootWorker = async () => {
  try {
    // dynamic on purpose (same as the subset worker): a static import would
    // fold the boot entry into the main chunk and defeat the entry split
    const { WorkerUrl } = await import("./tile-worker-boot.chunk");
    if (!WorkerUrl) {
      throw new WorkerUrlNotDefinedError();
    }
    if (!import.meta.url || WorkerUrl.toString() === import.meta.url) {
      throw new WorkerInTheMainChunkError();
    }
    const worker = new Worker(WorkerUrl, { type: "module" });
    worker.onmessage = onWorkerMessage;
    worker.onerror = (event) => disableWorker(event.message);
    worker.onmessageerror = () => disableWorker("messageerror");
    workerState = { worker, fontsOk: false };
    const fonts: TileWorkerRequest = {
      type: "fonts",
      faces: collectFontFaces(),
    };
    worker.postMessage(fonts);
  } catch (error) {
    disableWorker(error);
  }
};

/** elements the worker can draw: no DOM-only types, no frame clipping, RTL
 * text needs a DOM attribute, text needs fonts loaded inside the worker */
const isWorkerSafe = (element: ExcalidrawElement, fontsOk: boolean) => {
  switch (element.type) {
    case "image":
    case "embeddable":
    case "iframe":
    case "frame":
    case "magicframe":
      return false;
    default:
      if (element.frameId) {
        return false;
      }
      return !isTextElement(element) || (fontsOk && !isRTL(element.text));
  }
};

/**
 * Hands a missing tile to the worker. Returns true when the worker owns the
 * tile (just posted, or a job is already in flight): the caller then skips
 * the main-thread raster and only draws what is cheap this frame. Returns
 * false when the caller must raster on the main thread itself (worker not up
 * yet or disabled, tile ineligible, queue full).
 */
export const requestWorkerTile = (tile: {
  key: string;
  level: number;
  tx: number;
  ty: number;
  /** scene-space top-left of the tile */
  x1: number;
  y1: number;
  /** canvas scale (device pixel ratio) of the main canvas */
  scale: number;
  theme: Theme;
  background: string;
  /** tile elements in z order */
  elements: readonly ExcalidrawElement[];
  elementsMap: ElementsMap;
}): boolean => {
  if (inflight.has(tile.key)) {
    return true;
  }
  if (mainOnly.has(tile.key) || !workerWanted()) {
    return false;
  }
  if (!workerState) {
    if (!workerBooting) {
      workerBooting = true;
      void bootWorker();
    }
    return false;
  }
  if (inflight.size >= MAX_INFLIGHT_JOBS) {
    return false;
  }
  const { fontsOk, worker } = workerState;

  // the worker needs a self-contained map: containers and bound texts too,
  // otherwise `containerId` lookups differ from the main thread's full map
  const inTile = new Set<string>();
  const referenced = new Map<string, ExcalidrawElement>();
  const reference = (element: ExcalidrawElement | undefined) => {
    if (element && !inTile.has(element.id)) {
      referenced.set(element.id, element);
    }
  };
  for (const element of tile.elements) {
    inTile.add(element.id);
  }
  for (const element of tile.elements) {
    if (!isWorkerSafe(element, fontsOk)) {
      return false;
    }
    if (isTextElement(element) && element.containerId) {
      reference(tile.elementsMap.get(element.containerId));
    }
    for (const bound of element.boundElements ?? []) {
      if (bound.type === "text") {
        reference(tile.elementsMap.get(bound.id));
      }
    }
  }
  for (const element of referenced.values()) {
    if (!isWorkerSafe(element, fontsOk)) {
      return false;
    }
  }

  const jobId = ++jobSeq;
  const request: TileWorkerRequest = {
    type: "raster",
    jobId,
    tileKey: tile.key,
    level: tile.level,
    scale: tile.scale,
    dpr: window.devicePixelRatio,
    theme: tile.theme,
    background: tile.background,
    px: Math.round(TILE * tile.scale),
    x1: tile.x1,
    y1: tile.y1,
    elements: tile.elements as ExcalidrawElement[],
    context: [...referenced.values()],
  };
  inflight.set(tile.key, {
    jobId,
    level: tile.level,
    tx: tile.tx,
    ty: tile.ty,
  });
  try {
    worker.postMessage(request);
  } catch (error) {
    disableWorker(error);
    return false;
  }
  return true;
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
    if (tileCache.size() === 0 && inflight.size === 0 && mainOnly.size === 0) {
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
