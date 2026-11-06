import { afterAll, beforeAll, describe, expect, it } from "bun:test";

import type { ExcalidrawElement } from "../element/types";
import type { NormalizedZoomValue } from "../types";
import type { Renderer as RendererClass, RendererCamera } from "./renderer";
import type * as MutateModule from "../element/mutate-element";
import type * as RestoreModule from "../data/restore";
import type { Mutable } from "../utility-types";
import type Scene from "./scene";
import type { SceneDiff } from "./scene";

// Scene's import graph creates <img> placeholders at module load and reads
// `window` at runtime. Provide just that for the import, restore afterwards.
const shimmed = ["document", "window", "devicePixelRatio"] as const;
const saved = new Map<string, PropertyDescriptor | undefined>();

let SceneClass: typeof Scene;
let RendererCtor: typeof RendererClass;
let mutateRaw: typeof MutateModule.mutateElement;
let restoreElements: typeof RestoreModule.restoreElements;

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
    { mutateElement: mutateRaw },
    { restoreElements },
    { Renderer: RendererCtor },
  ] = await Promise.all([
    import("./scene"),
    import("../element/mutate-element"),
    import("../data/restore"),
    import("./renderer"),
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

const mutate = (
  element: ExcalidrawElement,
  updates: Parameters<typeof MutateModule.mutateElement>[1],
  informMutation = true,
) => mutateRaw(element as Mutable<ExcalidrawElement>, updates, informMutation);

const rect = (id: string, x = 0) =>
  ({ type: "rectangle", id, x, y: 0, width: 10, height: 10 } as const);

const setup = (ids: string[]) => {
  const scene = new SceneClass();
  const elements = restoreElements(
    ids.map((id) => rect(id)),
    null,
  );
  scene.replaceAllElements(elements);
  const diffs: SceneDiff[] = [];
  const cursor = { epoch: scene.diffAtom.changedEpoch };
  /** diffs emitted since the previous call */
  const take = () => {
    const since = scene.diffAtom.getDiffSince(cursor.epoch);
    cursor.epoch = scene.diffAtom.changedEpoch;
    expect(since).not.toBeNull();
    diffs.push(...since!);
    return since!;
  };
  return { scene, elements, take };
};

const ids = (list: readonly ExcalidrawElement[]) => list.map((e) => e.id);

describe("Scene diff", () => {
  it("reports added elements as upserted", () => {
    const { scene, take } = setup(["a"]);
    take();
    scene.replaceAllElements([
      ...scene.getElementsIncludingDeleted(),
      ...restoreElements([rect("b")], null),
    ]);
    const [diff] = take();
    expect(ids(diff.upserted)).toEqual(["b"]);
    expect(diff.removed).toEqual([]);
  });

  it("initial population upserts every element", () => {
    const scene = new SceneClass();
    const epoch = scene.diffAtom.changedEpoch;
    scene.replaceAllElements(restoreElements([rect("a"), rect("b")], null));
    const [diff] = scene.diffAtom.getDiffSince(epoch)!;
    expect(ids(diff.upserted).sort()).toEqual(["a", "b"]);
  });

  it("reports replaced references (same id) as upserted with the new object", () => {
    const { scene, elements, take } = setup(["a", "b"]);
    take();
    const replacement = { ...elements[0], x: 50 };
    scene.replaceAllElements([replacement, elements[1]]);
    const [diff] = take();
    expect(diff.upserted).toEqual([replacement]);
    expect(diff.upserted[0]).toBe(replacement);
    expect(diff.removed).toEqual([]);
  });

  it("reports an in-place mutation announced by mutateElement", () => {
    const { scene, elements, take } = setup(["a", "b"]);
    take();
    mutate(elements[1], { x: 7 });
    const [diff] = take();
    expect(ids(diff.upserted)).toEqual(["b"]);
    expect(diff.upserted[0]).toBe(elements[1]);
    expect(diff.removed).toEqual([]);
    expect(scene.getNonDeletedElementsMap().get("b")!.x).toBe(7);
  });

  it("silent mutations are held and flushed by the next trigger", () => {
    const { scene, elements, take } = setup(["a", "b", "c"]);
    take();
    const before = scene.diffAtom.changedEpoch;
    mutate(elements[0], { x: 1 }, false);
    mutate(elements[2], { x: 2 }, false);
    expect(scene.diffAtom.changedEpoch).toBe(before);

    scene.triggerUpdate();
    const diffs = take();
    expect(diffs).toHaveLength(1);
    expect(ids(diffs[0].upserted).sort()).toEqual(["a", "c"]);
  });

  it("a notified mutation also carries earlier silent ones", () => {
    const { elements, take } = setup(["a", "b"]);
    take();
    mutate(elements[0], { x: 1 }, false);
    mutate(elements[1], { x: 2 });
    const diffs = take();
    expect(diffs).toHaveLength(1);
    expect(ids(diffs[0].upserted).sort()).toEqual(["a", "b"]);
  });

  it("pending ids are cleared once emitted", () => {
    const { elements, take } = setup(["a", "b"]);
    take();
    mutate(elements[0], { x: 1 });
    take();
    mutate(elements[1], { x: 1 });
    const [diff] = take();
    expect(ids(diff.upserted)).toEqual(["b"]);
  });

  it("reports elements dropped from the scene as removed", () => {
    const { scene, elements, take } = setup(["a", "b"]);
    take();
    scene.replaceAllElements([elements[0]]);
    const [diff] = take();
    expect(diff.removed).toEqual(["b"]);
    expect(diff.upserted).toEqual([]);
  });

  it("reports soft-deleted elements as removed, not upserted", () => {
    const { scene, elements, take } = setup(["a", "b"]);
    take();
    mutate(elements[0], { isDeleted: true });
    const [diff] = take();
    expect(diff.removed).toEqual(["a"]);
    expect(diff.upserted).toEqual([]);
    expect(ids(scene.getNonDeletedElements())).toEqual(["b"]);
  });

  it("restores live membership when a deleted element is revived", () => {
    const { scene, elements, take } = setup(["a", "b"]);
    mutate(elements[0], { isDeleted: true });
    take();
    mutate(elements[0], { isDeleted: false });
    const [diff] = take();
    expect(ids(diff.upserted)).toEqual(["a"]);
    expect(diff.removed).toEqual([]);
    expect(ids(scene.getNonDeletedElements())).toEqual(["a", "b"]);
  });

  it("reorder keeps every id present (nothing removed)", () => {
    const { scene, elements, take } = setup(["a", "b", "c"]);
    take();
    scene.replaceAllElements([elements[2], elements[0], elements[1]]);
    const [diff] = take();
    expect(diff.removed).toEqual([]);
    expect(ids(scene.getElementsIncludingDeleted())).toEqual(["c", "a", "b"]);
  });

  it("retains mutation order and the latest diff through atom history", () => {
    const { scene, elements, take } = setup(["a"]);
    const first = take();
    mutate(elements[0], { x: 1 });
    mutate(elements[0], { x: 2 });
    const next = take();
    expect(next).toHaveLength(2);
    expect(next[1].epoch).toBeGreaterThan(next[0].epoch);
    expect(next[0].epoch).toBeGreaterThan(first[first.length - 1]?.epoch ?? 0);
    expect(scene.diffAtom.get()).toBe(next[1]);
  });


  it("callbacks still fire and destroy drops pending ids", () => {
    const { scene, elements, take } = setup(["a"]);
    take();
    let calls = 0;
    scene.onUpdate(() => calls++);
    mutate(elements[0], { x: 3 });
    expect(calls).toBe(1);

    mutate(elements[0], { x: 4 }, false);
    scene.destroy();
    scene.triggerUpdate();
    expect(calls).toBe(1);
    const diffs = take();
    expect(diffs[diffs.length - 1].upserted).toEqual([]);
  });
});

describe("Renderer", () => {
  const camera = (overrides: Partial<RendererCamera> = {}): RendererCamera => ({
    zoom: { value: 1 as NormalizedZoomValue },
    offsetLeft: 0,
    offsetTop: 0,
    scrollX: 0,
    scrollY: 0,
    width: 100,
    height: 100,
    editingTextElementId: null,
    newElementId: null,
    pendingImageElementId: null,
    ...overrides,
  });

  it("tracks visibility across mutations, camera moves and exclusions", () => {
    const scene = new SceneClass();
    const [inside, outside] = restoreElements(
      [rect("inside", 10), rect("outside", 10000)],
      null,
    );
    scene.replaceAllElements([inside, outside]);
    const renderer = new RendererCtor(scene);
    const visible = () =>
      renderer.getRenderableElements().visibleElements.map((e) => e.id);

    renderer.setCamera(camera());
    expect(visible()).toEqual(["inside"]);

    mutate(inside, { x: 10000 });
    expect(visible()).toEqual([]);

    mutate(outside, { x: 20 });
    expect(visible()).toEqual(["outside"]);

    renderer.setCamera(camera({ scrollX: -10000 }));
    expect(visible()).toEqual(["inside"]);

    renderer.setCamera(camera());
    expect(visible()).toEqual(["outside"]);

    renderer.setCamera(camera({ newElementId: "outside" }));
    expect(visible()).toEqual([]);
    expect(renderer.getRenderableElements().elementsMap.has("outside")).toBe(
      false,
    );

    renderer.setCamera(camera());
    expect(visible()).toEqual(["outside"]);
  });
});
