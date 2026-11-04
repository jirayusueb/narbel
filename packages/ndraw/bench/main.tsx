import { CaptureUpdateAction, Excalidraw, perf, type PerfReport } from "@narbel/ndraw";
import "@narbel/ndraw/index.css";
import { createRoot } from "react-dom/client";
import type { ExcalidrawElement } from "../src/excalidraw/element/types";
import type { ExcalidrawImperativeAPI } from "../src/excalidraw/types";
import { assertFixture, buildFixture, mulberry32, SCENE_SIZE, SEED } from "./fixture";

// Real pointer/wheel events are dispatched on the real canvas. A synthetic pointerId has no capture target,
// so the browser would throw from setPointerCapture; the harness (not the editor) swallows that.
for (const method of ["setPointerCapture", "releasePointerCapture"] as const) {
  const original = Element.prototype[method];
  Element.prototype[method] = function (this: Element, id: number) {
    try {
      original.call(this, id);
    } catch {
      /* synthetic pointer */
    }
  };
}

declare global {
  interface Window {
    EXCALIDRAW_ASSET_PATH?: string | string[];
    __bench: Bench;
    __benchReady: Promise<void>;
  }
}

type Report = PerfReport;

interface Bench {
  load(count: number): Promise<{ count: number; ms: number }>;
  pan(ms?: number): Promise<Report>;
  zoomWave(): Promise<Report>;
  hoverPath(ms?: number): Promise<Report>;
  boxSelect(): Promise<Report>;
  remoteBatch(size?: number): Promise<Report>;
}

// fonts come from the built dist next to this page, so the run needs no network
window.EXCALIDRAW_ASSET_PATH = new URL("dist/", location.href).href;

const REMOTE_BATCHES = 20;
const BOX_REPEATS = 3;
const ZOOM_MIN = 0.2;
const ZOOM_MAX = 2;
const ZOOM_STEP_DELTA = 3;
const ZOOM_SETTLE_MS = 1000;
const FRAME_CAP = 4000;

let api!: ExcalidrawImperativeAPI;
let densest = { x: SCENE_SIZE / 2, y: SCENE_SIZE / 2 };
let resolveReady!: () => void;
window.__benchReady = new Promise<void>((resolve) => {
  resolveReady = resolve;
});

const nextFrame = () => new Promise<number>((resolve) => requestAnimationFrame(resolve));
const frames = async (n: number) => {
  for (let i = 0; i < n; i++) {
    await nextFrame();
  }
};
const sleepFrames = async (ms: number) => {
  const start = performance.now();
  while (performance.now() - start < ms) {
    await nextFrame();
  }
};

/** reset, run the driver, let the last frame land, then read the counters */
const measure = async (driver: () => Promise<void>) => {
  await frames(3);
  perf.reset();
  await driver();
  await frames(3);
  return perf.report();
};

const canvas = () => document.querySelector<HTMLCanvasElement>("canvas.interactive")!;

const setView = (center: { x: number; y: number }, zoom: number) => {
  const { width, height } = api.getAppState();
  api.updateScene({
    appState: {
      zoom: { value: zoom as never },
      scrollX: width / 2 / zoom - center.x,
      scrollY: height / 2 / zoom - center.y,
    },
    captureUpdate: CaptureUpdateAction.NEVER,
  });
};

const toClient = (sceneX: number, sceneY: number) => {
  const { scrollX, scrollY, zoom, offsetLeft, offsetTop } = api.getAppState();
  return { x: offsetLeft + (sceneX + scrollX) * zoom.value, y: offsetTop + (sceneY + scrollY) * zoom.value };
};

const pointer = (type: "pointerdown" | "pointermove" | "pointerup", x: number, y: number, pressed: boolean) =>
  canvas().dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      composed: true,
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true,
      clientX: x,
      clientY: y,
      button: type === "pointermove" && !pressed ? -1 : 0,
      buttons: pressed ? 1 : 0,
    }),
  );

const wheelZoom = (deltaY: number, x: number, y: number) =>
  canvas().dispatchEvent(
    new WheelEvent("wheel", { bubbles: true, cancelable: true, ctrlKey: true, deltaY, clientX: x, clientY: y }),
  );

/** ctrl+wheel steps at the viewport centre until the zoom crosses target; capped so a stuck zoom cannot hang the run */
const wheelZoomTo = async (target: number) => {
  const { width, height, offsetLeft, offsetTop } = api.getAppState();
  const cx = offsetLeft + width / 2;
  const cy = offsetTop + height / 2;
  const startAbove = api.getAppState().zoom.value > target;
  for (let i = 0; i < FRAME_CAP; i++) {
    const z = api.getAppState().zoom.value;
    if (startAbove ? z <= target : z >= target) {
      return;
    }
    wheelZoom(startAbove ? ZOOM_STEP_DELTA : -ZOOM_STEP_DELTA, cx, cy);
    await nextFrame();
  }
  throw new Error(`zoom never reached ${target}`);
};

const sceneCenter = { x: SCENE_SIZE / 2, y: SCENE_SIZE / 2 };

const bench: Bench = {
  async load(count) {
    const start = performance.now();
    await window.__benchReady;
    const fixture = buildFixture(count, SEED);
    assertFixture(fixture.elements, count);
    densest = fixture.densest;
    api.updateScene({ elements: fixture.elements, captureUpdate: CaptureUpdateAction.NEVER });
    api.setActiveTool({ type: "selection" });
    setView(sceneCenter, 0.5);
    await document.fonts.ready;
    await frames(10);
    return { count: fixture.elements.length, ms: performance.now() - start };
  },

  pan(ms = 5000) {
    const amplitude = 800;
    return measure(async () => {
      setView(sceneCenter, 0.5);
      await frames(2);
      const { scrollX } = api.getAppState();
      const start = performance.now();
      for (let t = 0; t < ms; t = performance.now() - start) {
        const phase = (2 * Math.PI * 2 * t) / ms;
        api.updateScene({
          appState: { scrollX: scrollX + amplitude * Math.sin(phase) },
          captureUpdate: CaptureUpdateAction.NEVER,
        });
        await nextFrame();
      }
    });
  },

  zoomWave() {
    return measure(async () => {
      setView(sceneCenter, ZOOM_MIN);
      await frames(3);
      await wheelZoomTo(ZOOM_MAX);
      await wheelZoomTo(ZOOM_MIN);
      await sleepFrames(ZOOM_SETTLE_MS);
    });
  },

  hoverPath(ms = 3000) {
    return measure(async () => {
      setView(densest, 1);
      await frames(3);
      const c = toClient(densest.x, densest.y);
      const at = (t: number) => ({
        x: c.x + 300 * Math.sin((2 * Math.PI * t) / 1500),
        y: c.y + 200 * Math.sin((2 * Math.PI * 1.7 * t) / 1500),
      });
      const half = ms / 2;
      // phase 1: plain hover (hit testing); phase 2: arrow drag over the same path (binding search)
      const sweep = async (from: number, to: number, pressed: boolean) => {
        const start = performance.now();
        for (let t = from; t < to; t = from + performance.now() - start) {
          const p = at(t);
          pointer("pointermove", p.x, p.y, pressed);
          await nextFrame();
        }
      };
      await sweep(0, half, false);
      api.setActiveTool({ type: "arrow" });
      const first = at(half);
      pointer("pointerdown", first.x, first.y, true);
      await sweep(half, ms, true);
      const last = at(ms);
      pointer("pointerup", last.x, last.y, false);
      api.setActiveTool({ type: "selection" });
    });
  },

  boxSelect() {
    return measure(async () => {
      api.setActiveTool({ type: "selection" });
      setView(densest, 0.5);
      await frames(3);
      const { width, height, offsetLeft, offsetTop, scrollX, scrollY, zoom } = api.getAppState();
      const elements = api.getSceneElements();
      const free = (x: number, y: number) => {
        const sx = x / zoom.value - scrollX;
        const sy = y / zoom.value - scrollY;
        return !elements.some((e: ExcalidrawElement) => sx >= e.x - 20 && sx <= e.x + e.width + 20 && sy >= e.y - 20 && sy <= e.y + e.height + 20);
      };
      // start at a viewport corner with nothing under it so the drag draws a selection box instead of moving an element
      const corners = [
        { x: 4, y: 4 },
        { x: width - 4, y: 4 },
        { x: 4, y: height - 4 },
        { x: width - 4, y: height - 4 },
      ];
      const start = corners.find((p) => free(p.x, p.y));
      if (!start) {
        throw new Error("no empty viewport corner to start the selection box from");
      }
      const from = { x: offsetLeft + start.x, y: offsetTop + start.y };
      const to = { x: offsetLeft + width / 2, y: offsetTop + height / 2 };
      const steps = 40;
      for (let r = 0; r < BOX_REPEATS; r++) {
        pointer("pointerdown", from.x, from.y, true);
        for (let i = 1; i <= steps; i++) {
          pointer("pointermove", from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps, true);
          await nextFrame();
        }
        pointer("pointerup", to.x, to.y, false);
        await frames(2);
        api.updateScene({ appState: { selectedElementIds: {} }, captureUpdate: CaptureUpdateAction.NEVER });
        await frames(2);
      }
    });
  },

  remoteBatch(size = 200) {
    const random = mulberry32(SEED + 1);
    return measure(async () => {
      let elements = api.getSceneElementsIncludingDeleted() as readonly ExcalidrawElement[];
      for (let b = 0; b < REMOTE_BATCHES; b++) {
        const start = Math.floor(random() * Math.max(1, elements.length - size));
        const next = elements.slice();
        for (let i = start; i < Math.min(next.length, start + size); i++) {
          const el = next[i];
          next[i] = {
            ...el,
            x: el.x + (b % 2 === 0 ? 4 : -4),
            version: el.version + 1,
            versionNonce: Math.floor(random() * 2 ** 31),
            updated: Date.now(),
          };
        }
        elements = next;
        api.updateScene({ elements, captureUpdate: CaptureUpdateAction.NEVER });
        await frames(3);
      }
    });
  },
};

window.__bench = bench;

createRoot(document.getElementById("root")!).render(
  <Excalidraw
    excalidrawAPI={(instance) => {
      api = instance;
      resolveReady();
    }}
  />,
);
