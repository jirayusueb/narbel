/**
 * Worker entry URL + environment bootstrap for the tile rasterizer.
 *
 * Draw code (render-element.ts and everything it imports) reads `window`,
 * `devicePixelRatio` and creates DOM images at module load. A worker has none
 * of them, and ES imports of the shared chunk run before this chunk's own body,
 * so the globals are installed here and the real worker is loaded afterwards
 * with a dynamic import. Messages that arrive in between are replayed.
 *
 * Keep this file free of static imports: the main thread imports it just to
 * learn `WorkerUrl`, and it must not drag the draw code along.
 */
import type { TileWorkerRequest } from "./tile-worker.chunk";

export const WorkerUrl: URL | undefined = import.meta.url
  ? new URL(import.meta.url)
  : undefined;

// run only in the worker context
if (typeof window === "undefined" && typeof self !== "undefined") {
  const scope = globalThis as Record<string, unknown>;
  scope.window = globalThis;
  scope.devicePixelRatio = 1;
  // module-level `document.createElement("img")` (link icons): inert holders
  scope.document = { createElement: () => ({}) };

  const queued: MessageEvent<TileWorkerRequest>[] = [];
  self.onmessage = (event: MessageEvent<TileWorkerRequest>) => {
    queued.push(event);
  };
  import("./tile-worker.chunk")
    .then(({ installTileWorker }) => installTileWorker(queued))
    .catch((error: unknown) =>
      self.postMessage({
        type: "error",
        jobId: 0,
        tileKey: "",
        message: error instanceof Error ? error.message : String(error),
      }),
    );
}
