import throttle from "lodash.throttle";
import type {
  ExcalidrawElement,
  NonDeletedExcalidrawElement,
  NonDeleted,
  ExcalidrawFrameLikeElement,
  ElementsMapOrArray,
  SceneElementsMap,
  NonDeletedSceneElementsMap,
  OrderedExcalidrawElement,
  Ordered,
} from "../element/types";
import { isNonDeletedElement } from "../element";
import type { LinearElementEditor } from "../element/linear-element-editor";
import { isFrameLikeElement } from "../element/type-checks";
import { getSelectedElements } from "./selection";
import type { AppState } from "../types";
import type { Assert, SameType } from "../utility-types";
import { randomInteger } from "../random";
import {
  syncInvalidIndices,
  syncMovedIndices,
  validateFractionalIndices,
} from "../fractional-index";
import { arrayToMap } from "../utils";
import { toBrandedType } from "../utils";
import { ENV } from "../constants";
import { getElementsInGroup } from "../groups";

import { attachTileInvalidator } from "../renderer/tiles";
import { Atom, transact } from "../signals/signals";
import { SpatialIndex } from "./spatial-index";

type ElementIdKey = InstanceType<typeof LinearElementEditor>["elementId"];
type ElementKey = ExcalidrawElement | ElementIdKey;

type SceneStateCallback = () => void;
type SceneStateCallbackRemover = () => void;

export type SceneDiff = {
  /** scene-local monotonic sequence number of this diff */
  epoch: number;
  /** non-deleted elements added, replaced or mutated since the previous diff */
  upserted: readonly ExcalidrawElement[];
  /** ids that are no longer non-deleted elements of the scene */
  removed: readonly string[];
};

type SelectionHash = string & { __brand: "selectionHash" };

const getNonDeletedElements = <T extends ExcalidrawElement>(
  allElements: readonly T[],
) => {
  const elementsMap = new Map() as NonDeletedSceneElementsMap;
  const elements: T[] = [];
  for (const element of allElements) {
    if (!element.isDeleted) {
      elements.push(element as NonDeleted<T>);
      elementsMap.set(
        element.id,
        element as Ordered<NonDeletedExcalidrawElement>,
      );
    }
  }
  return { elementsMap, elements };
};

const validateIndicesThrottled = throttle(
  (elements: readonly ExcalidrawElement[]) => {
    if (
      import.meta.env.DEV ||
      import.meta.env.MODE === ENV.TEST ||
      window?.DEBUG_FRACTIONAL_INDICES
    ) {
      validateFractionalIndices(elements, {
        // throw only in dev & test, to remain functional on `DEBUG_FRACTIONAL_INDICES`
        shouldThrow: import.meta.env.DEV || import.meta.env.MODE === ENV.TEST,
        includeBoundTextValidation: true,
      });
    }
  },
  1000 * 60,
  { leading: true, trailing: false },
);

const hashSelectionOpts = (
  opts: Parameters<InstanceType<typeof Scene>["getSelectedElements"]>[0],
) => {
  const keys = ["includeBoundTextElement", "includeElementsInFrames"] as const;

  type HashableKeys = Omit<typeof opts, "selectedElementIds" | "elements">;

  // just to ensure we're hashing all expected keys
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  type _ = Assert<
    SameType<
      Required<HashableKeys>,
      Pick<Required<HashableKeys>, typeof keys[number]>
    >
  >;

  let hash = "";
  for (const key of keys) {
    hash += `${key}:${opts[key] ? "1" : "0"}`;
  }
  return hash as SelectionHash;
};

// ideally this would be a branded type but it'd be insanely hard to work with
// in our codebase
export type ExcalidrawElementsIncludingDeleted = readonly ExcalidrawElement[];

const isIdKey = (elementKey: ElementKey): elementKey is ElementIdKey => {
  if (typeof elementKey === "string") {
    return true;
  }
  return false;
};

class Scene {
  // ---------------------------------------------------------------------------
  // static methods/props
  // ---------------------------------------------------------------------------

  private static sceneMapByElement = new WeakMap<ExcalidrawElement, Scene>();
  private static sceneMapById = new Map<string, Scene>();

  static mapElementToScene(elementKey: ElementKey, scene: Scene) {
    if (isIdKey(elementKey)) {
      // for cases where we don't have access to the element object
      // (e.g. restore serialized appState with id references)
      this.sceneMapById.set(elementKey, scene);
    } else {
      this.sceneMapByElement.set(elementKey, scene);
      // if mapping element objects, also cache the id string when later
      // looking up by id alone
      this.sceneMapById.set(elementKey.id, scene);
    }
  }

  /**
   * @deprecated pass down `app.scene` and use it directly
   */
  static getScene(elementKey: ElementKey): Scene | null {
    if (isIdKey(elementKey)) {
      return this.sceneMapById.get(elementKey) || null;
    }
    return this.sceneMapByElement.get(elementKey) || null;
  }

  // ---------------------------------------------------------------------------
  // instance methods/props
  // ---------------------------------------------------------------------------

  private callbacks: Set<SceneStateCallback> = new Set();

  private nonDeletedElements: readonly Ordered<NonDeletedExcalidrawElement>[] =
    [];
  private nonDeletedElementsMap = toBrandedType<NonDeletedSceneElementsMap>(
    new Map(),
  );
  // ideally all elements within the scene should be wrapped around with `Ordered` type, but right now there is no real benefit doing so
  private elements: readonly OrderedExcalidrawElement[] = [];
  private nonDeletedFramesLikes: readonly NonDeleted<ExcalidrawFrameLikeElement>[] =
    [];
  private frames: readonly ExcalidrawFrameLikeElement[] = [];
  private elementsMap = toBrandedType<SceneElementsMap>(new Map());
  private selectedElementsCache: {
    selectedElementIds: AppState["selectedElementIds"] | null;
    elements: readonly NonDeletedExcalidrawElement[] | null;
    cache: Map<SelectionHash, NonDeletedExcalidrawElement[]>;
  } = {
    selectedElementIds: null,
    elements: null,
    cache: new Map(),
  };
  /**
   * Random integer regenerated each scene update.
   *
   * Does not relate to elements versions, it's only a renderer
   * cache-invalidation nonce at the moment.
   */
  private sceneNonce: number | undefined;

  /** ids mutated in place or replaced since the last emitted diff */
  private pendingDiffIds = new Set<string>();
  private diffEpoch = 0;
  /** mirrors `sceneNonce`; changes on every `triggerUpdate` */
  readonly nonceAtom = new Atom<number>(0);
  /**
   * Emitted on every `triggerUpdate`. Always set with its diff so that lazy
   * consumers can replay `getDiffSince` (and must rebuild when it's `null`).
   */
  readonly diffAtom = new Atom<SceneDiff, SceneDiff>({
    epoch: 0,
    upserted: [],
    removed: [],
  });

  /**
   * Records an element changed in place, regardless of whether the mutation
   * is announced; the next `triggerUpdate` flushes it into the diff.
   */
  markMutated(element: ExcalidrawElement) {
    this.pendingDiffIds.add(element.id);
  }

  private _spatialIndex: SpatialIndex | null = null;

  /**
   * Spatial index over the non-deleted elements, kept in sync with emitted
   * scene diffs. Created on first use; queries apply pending diffs lazily.
   */
  get spatialIndex(): SpatialIndex {
    return (this._spatialIndex ??= new SpatialIndex(this));
  }
  /** invalidates the static-scene tile cache on every emitted diff */
  private readonly tileInvalidator = attachTileInvalidator(this);

  getSceneNonce() {
    return this.sceneNonce;
  }

  getNonDeletedElementsMap() {
    return this.nonDeletedElementsMap;
  }

  getElementsIncludingDeleted() {
    return this.elements;
  }

  getElementsMapIncludingDeleted() {
    return this.elementsMap;
  }

  getNonDeletedElements() {
    return this.nonDeletedElements;
  }

  getFramesIncludingDeleted() {
    return this.frames;
  }

  getSelectedElements(opts: {
    // NOTE can be ommitted by making Scene constructor require App instance
    selectedElementIds: AppState["selectedElementIds"];
    /**
     * for specific cases where you need to use elements not from current
     * scene state. This in effect will likely result in cache-miss, and
     * the cache won't be updated in this case.
     */
    elements?: ElementsMapOrArray;
    // selection-related options
    includeBoundTextElement?: boolean;
    includeElementsInFrames?: boolean;
  }): NonDeleted<ExcalidrawElement>[] {
    const hash = hashSelectionOpts(opts);

    const elements = opts?.elements || this.nonDeletedElements;
    if (
      this.selectedElementsCache.elements === elements &&
      this.selectedElementsCache.selectedElementIds === opts.selectedElementIds
    ) {
      const cached = this.selectedElementsCache.cache.get(hash);
      if (cached) {
        return cached;
      }
    } else if (opts?.elements == null) {
      // if we're operating on latest scene elements and the cache is not
      //  storing the latest elements, clear the cache
      this.selectedElementsCache.cache.clear();
    }

    const selectedElements = getSelectedElements(
      elements,
      { selectedElementIds: opts.selectedElementIds },
      opts,
    );

    // cache only if we're not using custom elements
    if (opts?.elements == null) {
      this.selectedElementsCache.selectedElementIds = opts.selectedElementIds;
      this.selectedElementsCache.elements = this.nonDeletedElements;
      this.selectedElementsCache.cache.set(hash, selectedElements);
    }

    return selectedElements;
  }

  getNonDeletedFramesLikes(): readonly NonDeleted<ExcalidrawFrameLikeElement>[] {
    return this.nonDeletedFramesLikes;
  }

  getElement<T extends ExcalidrawElement>(id: T["id"]): T | null {
    return (this.elementsMap.get(id) as T | undefined) || null;
  }

  getNonDeletedElement(
    id: ExcalidrawElement["id"],
  ): NonDeleted<ExcalidrawElement> | null {
    const element = this.getElement(id);
    if (element && isNonDeletedElement(element)) {
      return element;
    }
    return null;
  }

  /**
   * A utility method to help with updating all scene elements, with the added
   * performance optimization of not renewing the array if no change is made.
   *
   * Maps all current excalidraw elements, invoking the callback for each
   * element. The callback should either return a new mapped element, or the
   * original element if no changes are made. If no changes are made to any
   * element, this results in a no-op. Otherwise, the newly mapped elements
   * are set as the next scene's elements.
   *
   * @returns whether a change was made
   */
  mapElements(
    iteratee: (element: ExcalidrawElement) => ExcalidrawElement,
  ): boolean {
    let didChange = false;
    const newElements = this.elements.map((element) => {
      const nextElement = iteratee(element);
      if (nextElement !== element) {
        didChange = true;
      }
      return nextElement;
    });
    if (didChange) {
      this.replaceAllElements(newElements);
    }
    return didChange;
  }

  replaceAllElements(nextElements: ElementsMapOrArray) {
    const _nextElements =
      // ts doesn't like `Array.isArray` of `instanceof Map`
      nextElements instanceof Array
        ? nextElements
        : Array.from(nextElements.values());
    const nextFrameLikes: ExcalidrawFrameLikeElement[] = [];

    validateIndicesThrottled(_nextElements);

    // diff against the previous state before it's overwritten
    const prevMap = this.elementsMap;
    let kept = 0;
    for (const element of _nextElements) {
      const prev = prevMap.get(element.id);
      if (prev) {
        kept++;
      }
      if (prev !== element) {
        this.pendingDiffIds.add(element.id);
      }
    }
    if (kept !== prevMap.size) {
      const nextIds = new Set<string>();
      for (const element of _nextElements) {
        nextIds.add(element.id);
      }
      for (const id of prevMap.keys()) {
        if (!nextIds.has(id)) {
          this.pendingDiffIds.add(id);
        }
      }
    }

    this.elements = syncInvalidIndices(_nextElements);
    this.elementsMap.clear();
    this.elements.forEach((element) => {
      if (isFrameLikeElement(element)) {
        nextFrameLikes.push(element);
      }
      this.elementsMap.set(element.id, element);
      Scene.mapElementToScene(element, this);
    });
    const nonDeletedElements = getNonDeletedElements(this.elements);
    this.nonDeletedElements = nonDeletedElements.elements;
    this.nonDeletedElementsMap = nonDeletedElements.elementsMap;

    this.frames = nextFrameLikes;
    this.nonDeletedFramesLikes = getNonDeletedElements(this.frames).elements;

    this.triggerUpdate();
  }

  triggerUpdate() {
    const upserted: ExcalidrawElement[] = [];
    const removed: string[] = [];
    let membershipChanged = false;
    for (const id of this.pendingDiffIds) {
      const element = this.elementsMap.get(id);
      if (element && this.nonDeletedElementsMap.has(id) === element.isDeleted) {
        membershipChanged = true;
      }
      if (!element || element.isDeleted) {
        removed.push(id);
      } else {
        upserted.push(element);
      }
    }
    // cleared before notifying so changes made by listeners go to the next diff
    this.pendingDiffIds.clear();
    if (membershipChanged) {
      const live = getNonDeletedElements(this.elements);
      this.nonDeletedElements = live.elements;
      this.nonDeletedElementsMap = live.elementsMap;
      this.nonDeletedFramesLikes = getNonDeletedElements(this.frames).elements;
    }

    const nonce = randomInteger();
    this.sceneNonce = nonce;
    const diff: SceneDiff = { epoch: ++this.diffEpoch, upserted, removed };
    transact(() => {
      this.nonceAtom.set(nonce);
      this.diffAtom.set(diff, diff);
    });

    for (const callback of Array.from(this.callbacks)) {
      callback();
    }
  }

  onUpdate(cb: SceneStateCallback): SceneStateCallbackRemover {
    if (this.callbacks.has(cb)) {
      throw new Error();
    }

    this.callbacks.add(cb);

    return () => {
      if (!this.callbacks.has(cb)) {
        throw new Error();
      }
      this.callbacks.delete(cb);
    };
  }

  destroy() {
    this.elements = [];
    this.nonDeletedElements = [];
    this.nonDeletedFramesLikes = [];
    this.frames = [];
    this.elementsMap.clear();
    this.selectedElementsCache.selectedElementIds = null;
    this.selectedElementsCache.elements = null;
    this.selectedElementsCache.cache.clear();

    Scene.sceneMapById.forEach((scene, elementKey) => {
      if (scene === this) {
        Scene.sceneMapById.delete(elementKey);
      }
    });

    // done not for memory leaks, but to guard against possible late fires
    // (I guess?)
    this.callbacks.clear();
    this.pendingDiffIds.clear();
  }

  insertElementAtIndex(element: ExcalidrawElement, index: number) {
    if (!Number.isFinite(index) || index < 0) {
      throw new Error(
        "insertElementAtIndex can only be called with index >= 0",
      );
    }

    const nextElements = [
      ...this.elements.slice(0, index),
      element,
      ...this.elements.slice(index),
    ];

    syncMovedIndices(nextElements, arrayToMap([element]));

    this.replaceAllElements(nextElements);
  }

  insertElementsAtIndex(elements: ExcalidrawElement[], index: number) {
    if (!elements.length) {
      return;
    }

    if (!Number.isFinite(index) || index < 0) {
      throw new Error(
        "insertElementAtIndex can only be called with index >= 0",
      );
    }

    const nextElements = [
      ...this.elements.slice(0, index),
      ...elements,
      ...this.elements.slice(index),
    ];

    syncMovedIndices(nextElements, arrayToMap(elements));

    this.replaceAllElements(nextElements);
  }

  insertElement = (element: ExcalidrawElement) => {
    const index = element.frameId
      ? this.getElementIndex(element.frameId)
      : this.elements.length;

    this.insertElementAtIndex(element, index);
  };

  insertElements = (elements: ExcalidrawElement[]) => {
    if (!elements.length) {
      return;
    }

    const index = elements[0]?.frameId
      ? this.getElementIndex(elements[0].frameId)
      : this.elements.length;

    this.insertElementsAtIndex(elements, index);
  };

  getElementIndex(elementId: string) {
    return this.elements.findIndex((element) => element.id === elementId);
  }

  getContainerElement = (
    element:
      | (ExcalidrawElement & {
          containerId: ExcalidrawElement["id"] | null;
        })
      | null,
  ) => {
    if (!element) {
      return null;
    }
    if (element.containerId) {
      return this.getElement(element.containerId) || null;
    }
    return null;
  };

  getElementsFromId = (id: string): ExcalidrawElement[] => {
    const elementsMap = this.getNonDeletedElementsMap();
    // first check if the id is an element
    const el = elementsMap.get(id);
    if (el) {
      return [el];
    }

    // then, check if the id is a group
    return getElementsInGroup(elementsMap, id);
  };
}

export default Scene;
