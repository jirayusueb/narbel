import { afterAll, beforeAll, describe, expect, it } from "bun:test";

import type { ExcalidrawElement } from "../element/types";
import type { Mutable } from "../utility-types";
import type Scene from "./scene";
import type * as BoundsModule from "../element/bounds";
import type * as MutateModule from "../element/mutate-element";
import type * as RestoreModule from "../data/restore";
import type * as SizeHelpersModule from "../element/size-helpers";
import type * as BindingModule from "../element/binding";

// Scene's import graph creates <img> placeholders at module load and reads
// `window` at runtime. Provide just that for the import, restore afterwards
// (same shim as scene.test.ts).
const shimmed = ["document", "window", "devicePixelRatio"] as const;
const saved = new Map<string, PropertyDescriptor | undefined>();

let SceneClass: typeof Scene;
let getElementBounds: typeof BoundsModule.getElementBounds;
let mutateElement: typeof MutateModule.mutateElement;
let restoreElements: typeof RestoreModule.restoreElements;
let isElementInViewport: typeof SizeHelpersModule.isElementInViewport;
let maxBindingGap: typeof BindingModule.maxBindingGap;
let bindingSearchPad: typeof BindingModule.bindingSearchPad;

beforeAll(async () => {
  for (const key of shimmed) {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  }
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      createElement(tag: string) {
        if (tag === "img") {
          return { src: "" };
        }
        throw new Error(`unexpected document.createElement(${tag})`);
      },
    },
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { location: new URL("http://localhost/") },
  });
  Object.defineProperty(globalThis, "devicePixelRatio", {
    configurable: true,
    value: 1,
  });

  [
    { default: SceneClass },
    { getElementBounds },
    { mutateElement },
    { restoreElements },
    { isElementInViewport },
    { maxBindingGap, bindingSearchPad },
  ] = await Promise.all([
    import("./scene"),
    import("../element/bounds"),
    import("../element/mutate-element"),
    import("../data/restore"),
    import("../element/size-helpers"),
    import("../element/binding"),
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

const mulberry32 = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const rand = mulberry32(42);

const TYPES = [
  "rectangle",
  "ellipse",
  "diamond",
  "text",
  "line",
] as const;

const makeFixture = () => {
  const raw: Record<string, unknown>[] = [];
  const shapeIds: string[] = [];
  for (let i = 0; i < 500; i++) {
    const type = TYPES[i % TYPES.length];
    const x = Math.round(rand() * 4000);
    const y = Math.round(rand() * 4000);
    const width = Math.round(20 + rand() * 180);
    const height = Math.round(20 + rand() * 180);
    const id = `el-${i}`;
    raw.push({
      type,
      id,
      x,
      y,
      width,
      height,
      // every 4th element is rotated
      angle: i % 4 === 3 ? rand() * Math.PI : 0,
      ...(type === "text" ? { text: `label ${i}`, fontSize: 20 } : {}),
      ...(type === "line"
        ? {
            points: [
              [0, 0],
              [width, height],
            ],
          }
        : {}),
    });
    if (type !== "text" && type !== "line") {
      shapeIds.push(id);
    }
  }
  // frames over clusters, some elements get framed via frameId below
  for (let i = 0; i < 4; i++) {
    raw.push({
      type: "frame",
      id: `frame-${i}`,
      x: i * 1000,
      y: i * 1000,
      width: 900,
      height: 900,
      name: `Frame ${i}`,
    });
  }
  // arrows bound to real shape ids
  for (let i = 0; i < 30; i++) {
    const start = shapeIds[(i * 7) % shapeIds.length];
    const end = shapeIds[(i * 13 + 3) % shapeIds.length];
    const x = Math.round(rand() * 4000);
    const y = Math.round(rand() * 4000);
    raw.push({
      type: "arrow",
      id: `arrow-${i}`,
      x,
      y,
      width: 100,
      height: 60,
      points: [
        [0, 0],
        [100, 60],
      ],
      startBinding: { elementId: start, focus: 0, gap: 4 },
      endBinding: { elementId: end, focus: 0, gap: 4 },
    });
  }
  // assign some shapes to frames
  raw.forEach((element, i) => {
    if (
      (element.type === "rectangle" || element.type === "ellipse") &&
      i % 5 === 0
    ) {
      element.frameId = `frame-${i % 4}`;
    }
  });
  return raw;
};

const setup = () => {
  const scene = new SceneClass();
  scene.replaceAllElements(restoreElements(makeFixture(), null));
  return scene;
};

const idsOf = (elements: readonly ExcalidrawElement[]) =>
  elements.map((element) => element.id);

describe("SpatialIndex", () => {
  it("returns exactly the linear bounds scan for point and box queries across pads", () => {
    const scene = setup();
    const index = scene.spatialIndex;
    const elementsMap = scene.getNonDeletedElementsMap();

    const hitsAt = (x: number, y: number, pad: number) =>
      idsOf(
        scene.getNonDeletedElements().filter((element) => {
          const [x1, y1, x2, y2] = getElementBounds(element, elementsMap);
          return (
            x >= x1 - pad && x <= x2 + pad && y >= y1 - pad && y <= y2 + pad
          );
        }),
      );

    const overlaps = (
      qx1: number,
      qy1: number,
      qx2: number,
      qy2: number,
    ) =>
      idsOf(
        scene.getNonDeletedElements().filter((element) => {
          const [x1, y1, x2, y2] = getElementBounds(element, elementsMap);
          return qx1 <= x2 && qy1 <= y2 && qx2 >= x1 && qy2 >= y1;
        }),
      );

    const zoomPads = [0.1, 1, 2].map((zoom) => ({
      zoom,
      // app.tsx point-hit pad: collision threshold + frame-name headroom
      pad: 8 / zoom + 37.5 / zoom,
      // binding.ts search pad
      bindingPad: bindingSearchPad({ value: zoom } as never),
    }));

    for (let q = 0; q < 200; q++) {
      const x = rand() * 4200;
      const y = rand() * 4200;
      if (q % 2 === 0) {
        for (const { pad, bindingPad } of zoomPads) {
          expect(idsOf(index.search({ x, y }, pad))).toEqual(hitsAt(x, y, pad));
          expect(idsOf(index.search({ x, y }, bindingPad))).toEqual(
            hitsAt(x, y, bindingPad),
          );
        }
      } else {
        const w = rand() * 600;
        const h = rand() * 600;
        expect(
          idsOf(index.search({ x1: x, y1: y, x2: x + w, y2: y + h })),
        ).toEqual(overlaps(x, y, x + w, y + h));
      }
    }
  });

  it("covers maxBindingGap at zoom 0.1, 0.5, 1 and 2, on every side and corner", () => {
    const scene = setup();
    const index = scene.spatialIndex;
    const elementsMap = scene.getNonDeletedElementsMap();

    for (const zoomValue of [0.1, 0.5, 1, 2]) {
      const zoom = { value: zoomValue } as never;
      const pad = bindingSearchPad(zoom);
      for (const element of scene.getNonDeletedElements()) {
        const [x1, y1, x2, y2] = getElementBounds(element, elementsMap);
        const gap =
          maxBindingGap(element, element.width, element.height, zoom) - 0.001;
        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2;
        // points just inside the binding distance outside each edge and corner
        const probes = [
          { x: x1 - gap, y: midY },
          { x: x2 + gap, y: midY },
          { x: midX, y: y1 - gap },
          { x: midX, y: y2 + gap },
          { x: x1 - gap, y: y1 - gap },
          { x: x2 + gap, y: y2 + gap },
        ];
        for (const probe of probes) {
          expect(idsOf(index.search(probe, pad))).toContain(element.id);
        }
      }
    }
  });

  it("culls exactly like the isElementInViewport loop", () => {
    const scene = setup();
    const index = scene.spatialIndex;
    const elementsMap = scene.getNonDeletedElementsMap();

    for (let q = 0; q < 40; q++) {
      const zoomValue = 0.1 + rand() * 1.9;
      const zoom = { value: zoomValue } as never;
      const offsetLeft = 0;
      const offsetTop = 0;
      const scrollX = rand() * 4000 - 2000;
      const scrollY = rand() * 4000 - 2000;
      const width = 400 + rand() * 1200;
      const height = 300 + rand() * 900;
      const viewTransformations = {
        zoom,
        offsetLeft,
        offsetTop,
        scrollX,
        scrollY,
      };

      const linear = Array.from(elementsMap.values()).filter((element) =>
        isElementInViewport(
          element,
          width,
          height,
          viewTransformations,
          elementsMap,
        ),
      );

      const viewportBounds = {
        x1: (0 - offsetLeft) / zoomValue - scrollX,
        y1: (0 - offsetTop) / zoomValue - scrollY,
        x2: (offsetLeft + width - offsetLeft) / zoomValue - scrollX,
        y2: (offsetTop + height - offsetTop) / zoomValue - scrollY,
      };
      const indexed = index.search(viewportBounds).filter((candidate) => {
        const element = elementsMap.get(candidate.id)!;
        return isElementInViewport(
          element,
          width,
          height,
          viewTransformations,
          elementsMap,
        );
      });

      expect(idsOf(indexed)).toEqual(idsOf(linear));
    }
  });

  it("stays equivalent after re-applying an element and after a forced base rebuild", () => {
    const scene = setup();
    const index = scene.spatialIndex;
    const elementsMap = scene.getNonDeletedElementsMap();

    const hitsAt = (x: number, y: number, pad: number) =>
      idsOf(
        scene.getNonDeletedElements().filter((element) => {
          const [x1, y1, x2, y2] = getElementBounds(element, elementsMap);
          return (
            x >= x1 - pad && x <= x2 + pad && y >= y1 - pad && y <= y2 + pad
          );
        }),
      );

    const checkQueries = () => {
      for (let q = 0; q < 40; q++) {
        const x = rand() * 4200;
        const y = rand() * 4200;
        const pad = 8 + 37.5;
        expect(idsOf(index.search({ x, y }, pad))).toEqual(hitsAt(x, y, pad));
      }
    };

    // re-apply the same element twice (mutate routes through markMutated)
    const first = scene.getNonDeletedElements()[10];
    mutateElement(first as Mutable<ExcalidrawElement>, { x: first.x + 250 });
    mutateElement(first as Mutable<ExcalidrawElement>, { x: first.x + 250 });
    checkQueries();

    // delete a couple of elements, they must drop out
    for (const element of scene.getNonDeletedElements().slice(20, 26)) {
      mutateElement(element as Mutable<ExcalidrawElement>, {
        isDeleted: true,
      });
    }
    checkQueries();

    // mutate 501 distinct base entries => staleBaseIds > 500 => full rebuild
    const toMove = scene.getNonDeletedElements().slice(0, 501);
    for (const element of toMove) {
      mutateElement(element as Mutable<ExcalidrawElement>, {
        x: element.x + 500,
        y: element.y + 300,
      });
    }
    checkQueries();
  });
});
