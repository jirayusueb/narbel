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
  contendedDrag(): Promise<Report>;
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
      // Programmatic staircase: the zoom-button / zoom-to-fit path sets zoom
      // directly, outside shouldCacheIgnoreZoom, so every step re-rasters in
      // the base engine. Deterministic positions, no debounce timing noise.
      const steps = 54;
      for (let i = 0; i <= steps; i++) {
        setView(sceneCenter, ZOOM_MIN + ((ZOOM_MAX - ZOOM_MIN) * i) / steps);
        await frames(1);
      }
      for (let i = steps - 1; i >= 0; i--) {
        setView(sceneCenter, ZOOM_MIN + ((ZOOM_MAX - ZOOM_MIN) * i) / steps);
        await frames(1);
      }
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
      // Fixed positions and minimum duration keep 60/120Hz runs comparable; overload may take longer.
      const samples = Math.ceil(ms / (1000 / 60));
      const half = Math.floor(samples / 2);
      const startedAt = performance.now();
      // phase 1: plain hover (hit testing); phase 2: arrow drag over the same path (binding search)
      const sweep = async (from: number, to: number, pressed: boolean) => {
        for (let i = from; i < to; i++) {
          const p = at((i * ms) / samples);
          pointer("pointermove", p.x, p.y, pressed);
          do {
            await nextFrame();
          } while (performance.now() < startedAt + ((i + 1) * ms) / samples);
        }
      };
      await sweep(0, half, false);
      api.setActiveTool({ type: "arrow" });
      const first = at((half * ms) / samples);
      pointer("pointerdown", first.x, first.y, true);
      await sweep(half, samples, true);
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

  // Engine-level guarantee only: the local drag follows the pointer exactly while remote pointers and element batches
  // arrive. Parking of remote versions of locally dragged elements lives in apps/web and cannot run here, so the
  // remote batches below never touch the dragged element. Both measurements read
  // rendered/scene output from outside the engine, so base and head are measured
  // the same way (an engine-side counter would not exist in the base build).
  contendedDrag() {
    const random = mulberry32(SEED + 2);
    const DRAG_ID = "bench-contended-drag";
    const PEER_ID = "bench-peer-0";
    const FRAMES = 120;
    const STEP_PX = 3;
    const REMOTE_EVERY = 4;
    // a peer teleporting across the screen (well above the 24px jump threshold);
    // smoothing must glide it regardless of distance, not just small hops
    const POINTER_JUMP = 200;
    const JUMP_PX = 24;
    // clients.ts getClientColor: hsl(hue, 100%, 83%) with hue from a hash of the id
    let hash = 0;
    for (let i = 0; i < PEER_ID.length; i += 1) {
      hash = (hash << 5) - hash + PEER_ID.charCodeAt(i);
    }
    const probe = document.createElement("canvas").getContext("2d")!;
    probe.fillStyle = `hsl(${(Math.abs(hash) % 37) * 10}, 100%, 83%)`;
    probe.fillRect(0, 0, 1, 1);
    const [cr, cg, cb] = probe.getImageData(0, 0, 1, 1).data;
    // the arrow tip is the top-most pixel of the peer colour (clients.ts draws
    // the 11x14 arrow at the pointer, the name label below it); tracking the tip
    // keeps label width/clamping out of the measurement
    const cursorCentroid = () => {
      const c = canvas();
      const { data, width } = c.getContext("2d")!.getImageData(0, 0, c.width, c.height);
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] > 200 && Math.abs(data[i] - cr) < 3 && Math.abs(data[i + 1] - cg) < 3 && Math.abs(data[i + 2] - cb) < 3) {
          const p = i / 4;
          return { x: (p % width) / devicePixelRatio, y: Math.floor(p / width) / devicePixelRatio };
        }
      }
      return null;
    };
    return measure(async () => {
      api.setActiveTool({ type: "selection" });
      setView(densest, 1);
      await frames(3);
      const template = (api.getSceneElements() as readonly ExcalidrawElement[]).find((e) => e.type === "rectangle");
      if (!template) {
        throw new Error("fixture has no rectangle to clone");
      }
      const dragged = {
        ...template,
        id: DRAG_ID,
        x: densest.x - 100,
        y: densest.y - 100,
        width: 200,
        height: 200,
        angle: 0,
        fillStyle: "solid",
        backgroundColor: "#ffc9c9",
        isDeleted: false,
        groupIds: [],
        frameId: null,
        boundElements: null,
        locked: false,
        version: 1,
      } as ExcalidrawElement;
      api.updateScene({
        elements: [...api.getSceneElementsIncludingDeleted(), dragged],
        appState: { selectedElementIds: { [DRAG_ID]: true } },
        captureUpdate: CaptureUpdateAction.NEVER,
      });
      await frames(3);
      perf.count("pointerJumps", 0);

      const down = toClient(densest.x, densest.y);
      const startX = dragged.x;
      pointer("pointerdown", down.x, down.y, true);
      // a jump is cursor travel faster than 24px per 60Hz frame; reads can span
      // more than one engine frame, so compare against the elapsed time
      let lastCursor: { x: number; y: number; t: number } | null = null;
      for (let f = 1; f <= FRAMES; f++) {
        pointer("pointermove", down.x + f * STEP_PX, down.y, true);
        if (f % REMOTE_EVERY === 0) {
          const sign = (f / REMOTE_EVERY) % 2 === 0 ? 1 : -1;
          const collaborators = new Map([
            [PEER_ID, { id: PEER_ID, pointer: { x: densest.x + sign * POINTER_JUMP, y: densest.y - 150, tool: "pointer" }, button: "up", username: "peer" }],
          ]);
          // the live dragged element is kept as is: the local gesture owns it
          const next = (api.getSceneElementsIncludingDeleted() as readonly ExcalidrawElement[]).slice();
          for (let n = 0; n < 50; n++) {
            const i = Math.floor(random() * next.length);
            const el = next[i];
            if (el.id !== DRAG_ID) {
              next[i] = { ...el, x: el.x + sign * 4, version: el.version + 1, versionNonce: Math.floor(random() * 2 ** 31) };
            }
          }
          api.updateScene({ elements: next, collaborators, captureUpdate: CaptureUpdateAction.NEVER } as never);
        }
        await nextFrame();
        const cursor = cursorCentroid();
        const now = performance.now();
        if (cursor && lastCursor) {
          const moved = Math.hypot(cursor.x - lastCursor.x, cursor.y - lastCursor.y);
          if (moved > 0) {
            // measured against when the cursor last moved: a frame the canvas did
            // not repaint (a long main-thread task) is a dropped frame, not a jump
            const frames60 = Math.max(1, (now - lastCursor.t) / (1000 / 60));
            const step = moved / frames60;
            perf.sample("maxPointerStep", step);
            if (step > JUMP_PX) {
              perf.count("pointerJumps");
            }
            lastCursor = { x: cursor.x, y: cursor.y, t: now };
          }
        } else {
          lastCursor = cursor ? { x: cursor.x, y: cursor.y, t: now } : null;
        }
        const shown = (api.getSceneElements() as readonly ExcalidrawElement[]).find((e) => e.id === DRAG_ID)!;
        perf.sample("maxDragDeviation", Math.abs(shown.x - (startX + f * STEP_PX)));
      }
      pointer("pointerup", down.x + FRAMES * STEP_PX, down.y, false);
      api.updateScene({ collaborators: new Map(), captureUpdate: CaptureUpdateAction.NEVER });
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
