import { isElementInViewport } from "../element/size-helpers";
import { isImageElement } from "../element/type-checks";
import type {
  ExcalidrawElement,
  NonDeletedElementsMap,
  NonDeletedExcalidrawElement,
} from "../element/types";
import { renderInteractiveSceneThrottled } from "../renderer/interactive-scene";
import { renderStaticSceneThrottled } from "../renderer/static-scene";

import type { AppState } from "../types";
import { toBrandedType } from "../utils";
import { perf } from "../perf/performance-manager";
import { Atom, Computed } from "../signals/signals";
import type Scene from "./scene";
import type { RenderableElementsMap } from "./types";

/**
 * Everything besides the scene that decides which elements get rendered.
 * Applied to the renderer from canvas effects (never during React render).
 */
export type RendererCamera = {
  zoom: AppState["zoom"];
  offsetLeft: AppState["offsetLeft"];
  offsetTop: AppState["offsetTop"];
  scrollX: AppState["scrollX"];
  scrollY: AppState["scrollY"];
  width: AppState["width"];
  height: AppState["height"];
  editingTextElementId: ExcalidrawElement["id"] | null;
  newElementId: ExcalidrawElement["id"] | null;
  pendingImageElementId: AppState["pendingImageElementId"];
};

type RenderFilter = Pick<
  RendererCamera,
  "editingTextElementId" | "newElementId" | "pendingImageElementId"
>;

export type RenderableElements = {
  elementsMap: RenderableElementsMap;
  visibleElements: readonly NonDeletedExcalidrawElement[];
};

export const toRendererCamera = (
  appState: Pick<
    AppState,
    | "zoom"
    | "offsetLeft"
    | "offsetTop"
    | "scrollX"
    | "scrollY"
    | "width"
    | "height"
    | "editingTextElement"
    | "newElement"
    | "pendingImageElementId"
  >,
): RendererCamera => ({
  zoom: appState.zoom,
  offsetLeft: appState.offsetLeft,
  offsetTop: appState.offsetTop,
  scrollX: appState.scrollX,
  scrollY: appState.scrollY,
  width: appState.width,
  height: appState.height,
  editingTextElementId:
    appState.editingTextElement?.type === "text"
      ? appState.editingTextElement.id
      : null,
  newElementId: appState.newElement?.id ?? null,
  pendingImageElementId: appState.pendingImageElementId,
});

const isSameFilter = (a: RenderFilter, b: RenderFilter) =>
  a.editingTextElementId === b.editingTextElementId &&
  a.newElementId === b.newElementId &&
  a.pendingImageElementId === b.pendingImageElementId;

export const isSameCamera = (a: RendererCamera, b: RendererCamera) =>
  a === b ||
  (a.zoom.value === b.zoom.value &&
    a.offsetLeft === b.offsetLeft &&
    a.offsetTop === b.offsetTop &&
    a.scrollX === b.scrollX &&
    a.scrollY === b.scrollY &&
    a.width === b.width &&
    a.height === b.height &&
    isSameFilter(a, b));

const INITIAL_CAMERA: RendererCamera = {
  zoom: { value: 1 as AppState["zoom"]["value"] },
  offsetLeft: 0,
  offsetTop: 0,
  scrollX: 0,
  scrollY: 0,
  width: 0,
  height: 0,
  editingTextElementId: null,
  newElementId: null,
  pendingImageElementId: null,
};

export class Renderer {
  private scene: Scene;
  private cameraAtom = new Atom<RendererCamera>(INITIAL_CAMERA);

  /** keeps its identity until a filter field changes, so panning never invalidates the map */
  private filter = new Computed<RenderFilter>((last) => {
    const camera = this.cameraAtom.get();
    return last && isSameFilter(last, camera) ? last : { ...camera };
  }, [this.cameraAtom]);

  /** scene elements minus the ones that must not be drawn (viewport independent) */
  private renderableMap: Computed<RenderableElementsMap>;
  private renderable: Computed<RenderableElements>;

  constructor(scene: Scene) {
    this.scene = scene;

    this.renderableMap = new Computed<RenderableElementsMap>(
      () => {
        const { editingTextElementId, newElementId, pendingImageElementId } =
          this.filter.get();
        if (!editingTextElementId && !newElementId && !pendingImageElementId) {
          return toBrandedType<RenderableElementsMap>(
            this.scene.getNonDeletedElementsMap(),
          );
        }
        const elementsMap = toBrandedType<RenderableElementsMap>(new Map());

        for (const element of this.scene.getNonDeletedElements()) {
          if (
            // => not placed on canvas yet (but in elements array)
            (isImageElement(element) && pendingImageElementId === element.id) ||
            newElementId === element.id ||
            // we don't want to render text element that's being currently
            // edited (it's rendered on remote only)
            editingTextElementId === element.id
          ) {
            continue;
          }
          elementsMap.set(element.id, element);
        }
        return elementsMap;
      },
      [this.scene.diffAtom, this.filter],
    );

    this.renderable = new Computed<RenderableElements>(
      () => {
        const elementsMap = this.renderableMap.get();
        const visibleElements = getVisibleCanvasElements(
          elementsMap,
          this.cameraAtom.get(),
        );
        return { elementsMap, visibleElements };
      },
      [this.renderableMap, this.cameraAtom, this.scene.diffAtom],
    );
  }

  /** No-op (and no epoch bump) when the camera is unchanged. */
  public setCamera(camera: RendererCamera) {
    if (!isSameCamera(this.cameraAtom.get(), camera)) {
      this.cameraAtom.set(camera);
    }
  }

  /**
   * Snapshot for the camera last applied with `setCamera`. Memoized: repeated
   * reads return the same object until the scene or camera changes.
   */
  public getRenderableElements(): RenderableElements {
    const startedAt = perf.start();
    const previousEpoch = this.renderable.changedEpoch;
    const elements = this.renderable.get();
    if (this.renderable.changedEpoch !== previousEpoch) {
      perf.end("cull", startedAt);
    }
    return elements;
  }

  // NOTE Doesn't destroy everything (scene, rc, etc.) because it may not be
  // safe to break TS contract here (for upstream cases)
  public destroy() {
    renderInteractiveSceneThrottled.cancel();
    renderStaticSceneThrottled.cancel();
  }
}

const getVisibleCanvasElements = (
  elementsMap: NonDeletedElementsMap,
  { zoom, offsetLeft, offsetTop, scrollX, scrollY, height, width }: RendererCamera,
): readonly NonDeletedExcalidrawElement[] => {
  const viewTransformations = { zoom, offsetLeft, offsetTop, scrollX, scrollY };
  const visibleElements: NonDeletedExcalidrawElement[] = [];
  for (const element of elementsMap.values()) {
    if (
      isElementInViewport(
        element,
        width,
        height,
        viewTransformations,
        elementsMap,
      )
    ) {
      visibleElements.push(element);
    }
  }
  return visibleElements;
};
