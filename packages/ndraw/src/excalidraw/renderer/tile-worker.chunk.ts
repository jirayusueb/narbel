/**
 * Tile rasterizer. Runs the same per-element draw code as the main thread
 * (render-element.ts) against an OffscreenCanvas and returns the result as a
 * transferable ImageBitmap. Own entry in tsdown.config.ts; started through
 * tile-worker-boot.chunk.ts (`WorkerUrl`) by renderer/tiles.ts.
 *
 * Index rebuilds are NOT done here: see the note in scene/spatial-index.ts.
 */
import rough from "roughjs/bin/rough";

import { getDefaultAppState } from "../app-state";
import type {
  ExcalidrawElement,
  NonDeletedExcalidrawElement,
  Theme,
} from "../element/types";
import { getBoundTextElement } from "../element/text-element";
import { isTextElement } from "../element/type-checks";
import type { StaticCanvasAppState } from "../types";
import type {
  RenderableElementsMap,
  StaticCanvasRenderConfig,
} from "../scene/types";
import type { NonDeletedSceneElementsMap } from "../element/types";
import { getFontString } from "../utils";
import { setCanvasFactory } from "./helpers";
import { renderElement } from "./render-element";

export type TileWorkerFace = {
  family: string;
  src: string;
  descriptors: FontFaceDescriptors;
};

export type TileWorkerRequest =
  | { type: "fonts"; faces: TileWorkerFace[] }
  | {
      type: "raster";
      /** echoed back; main discards replies whose job id is no longer current */
      jobId: number;
      tileKey: string;
      level: number;
      /** device pixel ratio the main canvas is scaled by */
      scale: number;
      dpr: number;
      theme: Theme;
      /** main renderConfig.canvasBackgroundColor (arrowhead knockouts read it) */
      background: string;
      /** tile edge in canvas pixels */
      px: number;
      /** scene-space rect of the tile */
      x1: number;
      y1: number;
      /** elements to paint, z order */
      elements: ExcalidrawElement[];
      /** containers / bound texts the painted elements reference (map only) */
      context: ExcalidrawElement[];
    };

export type TileWorkerResponse =
  | { type: "fonts-ready"; ok: boolean }
  | {
      type: "tile";
      jobId: number;
      tileKey: string;
      bitmap: ImageBitmap;
      /** raster time inside the worker */
      ms: number;
    }
  | { type: "unsupported"; jobId: number; tileKey: string; reason: string }
  | { type: "error"; jobId: number; tileKey: string; message: string };

const post = (message: TileWorkerResponse, transfer: Transferable[] = []) =>
  self.postMessage(message, { transfer });

let fontsOk = false;

const getWorkerFonts = (): FontFaceSet | undefined =>
  "fonts" in self ? (self.fonts as FontFaceSet) : undefined;

const isUnsupported = (element: ExcalidrawElement): string | null => {
  switch (element.type) {
    case "image":
    case "embeddable":
    case "iframe":
    case "frame":
    case "magicframe":
      return element.type;
    default:
      return element.frameId ? "frameId" : null;
  }
};

const handleFonts = (faces: TileWorkerFace[]) => {
  const fontSet = getWorkerFonts();
  if (!fontSet || typeof FontFace === "undefined") {
    fontsOk = false;
  } else {
    try {
      for (const { family, src, descriptors } of faces) {
        fontSet.add(new FontFace(family, src, descriptors));
      }
      fontsOk = true;
    } catch {
      fontsOk = false;
    }
  }
  post({ type: "fonts-ready", ok: fontsOk });
};

const handleRaster = async (
  request: Extract<TileWorkerRequest, { type: "raster" }>,
) => {
  const { jobId, tileKey, elements, context, level, scale, dpr, theme, px, background } =
    request;
  const startedAt = performance.now();
  const unsupported = (reason: string) =>
    post({ type: "unsupported", jobId, tileKey, reason });

  const elementsMap = new Map<string, ExcalidrawElement>();
  for (const element of [...context, ...elements]) {
    const reason = isUnsupported(element);
    if (reason) {
      return unsupported(reason);
    }
    elementsMap.set(element.id, element);
  }

  // same contract as the main thread's document.fonts.load before drawing text
  const charsPerFont = new Map<string, Set<string>>();
  for (const element of elementsMap.values()) {
    if (isTextElement(element)) {
      const font = getFontString(element);
      const chars = charsPerFont.get(font) ?? new Set<string>();
      for (const char of element.text) {
        chars.add(char);
      }
      charsPerFont.set(font, chars);
    }
  }
  if (charsPerFont.size > 0) {
    if (!fontsOk) {
      return unsupported("fonts-not-ready");
    }
    const fontSet = getWorkerFonts()!;
    try {
      await Promise.all(
        [...charsPerFont].map(([font, chars]) =>
          fontSet.load(font, [...chars].join("")),
        ),
      );
    } catch {
      return unsupported("font-load-failed");
    }
    // fonts registry (getVerticalOffset metrics) builds lazily on first use
  }

  const canvas = new OffscreenCanvas(px, px);
  const ctx = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;
  ctx.scale(scale * level, scale * level);

  // mirrors the main thread's tile pass (static-scene.ts paintElements);
  // frame clipping and link icons never reach the worker
  const appState = {
    ...getDefaultAppState(),
    theme,
    zoom: { value: level },
    scrollX: -request.x1,
    scrollY: -request.y1,
  } as unknown as StaticCanvasAppState;
  const renderConfig: StaticCanvasRenderConfig = {
    canvasBackgroundColor: background,
    imageCache: new Map(),
    renderGrid: false,
    isExporting: false,
    embedsValidationStatus: new Map(),
    elementsPendingErasure: new Set(),
    pendingFlowchartNodes: null,
  };
  const map = elementsMap as unknown as RenderableElementsMap;
  const allMap = elementsMap as unknown as NonDeletedSceneElementsMap;
  const rc = rough.canvas(canvas as unknown as HTMLCanvasElement);

  for (const element of elements as NonDeletedExcalidrawElement[]) {
    if (
      isTextElement(element) &&
      element.containerId &&
      elementsMap.has(element.containerId)
    ) {
      continue;
    }
    ctx.save();
    renderElement(element, map, allMap, rc, ctx, renderConfig, appState, dpr);
    const boundText = getBoundTextElement(element, map);
    if (boundText) {
      renderElement(boundText, map, allMap, rc, ctx, renderConfig, appState, dpr);
    }
    ctx.restore();
  }

  const bitmap = canvas.transferToImageBitmap();
  post(
    { type: "tile", jobId, tileKey, bitmap, ms: performance.now() - startedAt },
    [bitmap],
  );
};

/** Called by tile-worker-boot.chunk once the worker globals are in place. */
export const installTileWorker = (
  queued: readonly MessageEvent<TileWorkerRequest>[],
) => {
  setCanvasFactory((width, height) => new OffscreenCanvas(width, height));

  const onMessage = (event: MessageEvent<TileWorkerRequest>) => {
    const request = event.data;
    if (request.type === "fonts") {
      handleFonts(request.faces);
      return;
    }
    handleRaster(request).catch((error: unknown) =>
      post({
        type: "error",
        jobId: request.jobId,
        tileKey: request.tileKey,
        message: error instanceof Error ? error.message : String(error),
      }),
    );
  };
  self.onmessage = onMessage;
  queued.forEach(onMessage);
};
