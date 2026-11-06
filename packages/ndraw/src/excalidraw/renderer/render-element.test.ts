import { afterAll, beforeAll, describe, expect, it } from "bun:test";

import type * as RenderElementModule from "./render-element";
import type * as RestoreModule from "../data/restore";
import type { ExcalidrawElement } from "../element/types";

// render-element's import graph creates <img> placeholders and reads `window`
const shimmed = ["document", "window", "devicePixelRatio"] as const;
const saved = new Map<string, PropertyDescriptor | undefined>();

let drawElementFromCanvas: typeof RenderElementModule.drawElementFromCanvas;
let restoreElements: typeof RestoreModule.restoreElements;

beforeAll(async () => {
  for (const key of shimmed) {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  }
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { createElement: (tag: string) => (tag === "img" ? { src: "" } : null) },
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { location: new URL("http://localhost/"), devicePixelRatio: 2 },
  });
  Object.defineProperty(globalThis, "devicePixelRatio", { configurable: true, value: 2 });
  [{ drawElementFromCanvas }, { restoreElements }] = await Promise.all([
    import("./render-element"),
    import("../data/restore"),
  ]);
});

afterAll(() => {
  for (const key of shimmed) {
    const descriptor = saved.get(key);
    if (descriptor) {
      Object.defineProperty(globalThis, key, descriptor);
    } else {
      Reflect.deleteProperty(globalThis, key);
    }
  }
});

type DrawImageCall = [unknown, number, number, number, number];

/** a 2d context that records drawImage destination rects and ignores transforms */
const recordingContext = () => {
  const calls: DrawImageCall[] = [];
  const noop = () => {};
  const context = {
    save: noop,
    restore: noop,
    scale: noop,
    translate: noop,
    rotate: noop,
    drawImage: (...args: DrawImageCall) => calls.push(args),
  };
  return { context: context as unknown as CanvasRenderingContext2D, calls };
};

const LOD = 0.5;
const DPR = 2;

const rectangle = () =>
  restoreElements(
    [{ type: "rectangle", id: "r", x: 100, y: 50, width: 160, height: 120 }] as unknown as ExcalidrawElement[],
    null,
  )[0];

/** the raster the element canvas cache holds for this rectangle at LOD 0.5 */
const rasterAtLod = (element: ExcalidrawElement) => {
  const scale = DPR * LOD;
  return {
    element,
    canvas: { width: (element.width + 40) * scale, height: (element.height + 40) * scale },
    theme: "light",
    scale,
    angle: element.angle,
    zoomValue: LOD,
    lodScale: LOD,
    canvasOffsetX: 0,
    canvasOffsetY: 0,
    boundTextElementVersion: null,
    imageCrop: null,
    containingFrameOpacity: 100,
    boundTextCanvas: { width: 0, height: 0 },
  };
};

const drawnRect = (zoom: number) => {
  const element = rectangle();
  const { context, calls } = recordingContext();
  drawElementFromCanvas(
    rasterAtLod(element) as never,
    context,
    {} as never,
    { zoom: { value: zoom }, scrollX: 0, scrollY: 0 } as never,
    new Map([[element.id, element]]) as never,
  );
  expect(calls).toHaveLength(1);
  const [, x, y, width, height] = calls[0];
  return { x, y, width, height };
};

describe("drawElementFromCanvas", () => {
  // the static scene's context already carries the zoom; a raster cached at a quantized LOD
  // must land on the same scene rect at every zoom inside that LOD band
  it("places a LOD raster on the same scene rect at every zoom of its band", () => {
    const atLod = drawnRect(LOD);
    for (const zoom of [0.4, 0.6, 0.7]) {
      expect(drawnRect(zoom)).toEqual(atLod);
    }
  });
});
