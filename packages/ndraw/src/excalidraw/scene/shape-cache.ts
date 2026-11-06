import type { Drawable } from "roughjs/bin/core";
import { RoughGenerator } from "roughjs/bin/generator";
import type {
  ExcalidrawElement,
  ExcalidrawSelectionElement,
} from "../element/types";
import { elementWithCanvasCache } from "../renderer/render-element";
import { _generateElementShape } from "./shape";
import type { ElementShape, ElementShapes } from "./types";
import { COLOR_PALETTE } from "../colors";
import type { AppState, EmbedsValidationStatus } from "../types";

export class ShapeCache {
  private static rg = new RoughGenerator();
  // shapes are zoom-quantized: lod 1 = full detail (bounds, export, editor),
  // lower lods apply the low-zoom simplification
  private static cache = new WeakMap<
    ExcalidrawElement,
    Map<number, ElementShape>
  >();

  /**
   * Retrieves shape from cache if available. Use this only if shape
   * is optional and you have a fallback in case it's not cached.
   */
  public static get = <T extends ExcalidrawElement>(element: T, lodScale = 1) => {
    return ShapeCache.cache.get(element)?.get(lodScale) as T["type"] extends keyof ElementShapes
      ? ElementShapes[T["type"]] | undefined
      : ElementShape | undefined;
  };

  public static set = <T extends ExcalidrawElement>(
    element: T,
    shape: T["type"] extends keyof ElementShapes
      ? ElementShapes[T["type"]]
      : Drawable,
    lodScale = 1,
  ) =>
    ShapeCache.cache.set(
      element,
      (ShapeCache.cache.get(element) ?? new Map()).set(lodScale, shape),
    );

  public static delete = (element: ExcalidrawElement) =>
    ShapeCache.cache.delete(element);

  public static destroy = () => {
    ShapeCache.cache = new WeakMap();
  };

  /**
   * Generates & caches shape for element if not already cached, otherwise
   * returns cached shape.
   */
  public static generateElementShape = <
    T extends Exclude<ExcalidrawElement, ExcalidrawSelectionElement>,
  >(
    element: T,
    renderConfig: {
      isExporting: boolean;
      canvasBackgroundColor: AppState["viewBackgroundColor"];
      embedsValidationStatus: EmbedsValidationStatus;
    } | null,
    lodScale = 1,
  ) => {
    // when exporting, always regenerated to guarantee the latest shape
    const cachedShape = renderConfig?.isExporting
      ? undefined
      : ShapeCache.get(element, lodScale);

    // `null` indicates no rc shape applicable for this element type,
    // but it's considered a valid cache value (= do not regenerate)
    if (cachedShape !== undefined) {
      return cachedShape;
    }

    // A miss at a new lod band is not an element mutation: keep the raster
    // cache so a zoom change inside a band does not regenerate canvases.
    const perElement = ShapeCache.cache.get(element);
    const lodMiss = perElement !== undefined && !perElement.has(lodScale);
    if (!lodMiss) {
      elementWithCanvasCache.delete(element);
    }

    const shape = _generateElementShape(
      element,
      ShapeCache.rg,
      renderConfig || {
        isExporting: false,
        canvasBackgroundColor: COLOR_PALETTE.white,
        embedsValidationStatus: null,
      },
      lodScale,
    ) as T["type"] extends keyof ElementShapes
      ? ElementShapes[T["type"]]
      : Drawable | null;

    // text/image shapes are legitimately null (ElementShapes allows it); other types never return null here
    ShapeCache.set(
      element,
      shape as T["type"] extends keyof ElementShapes
        ? ElementShapes[T["type"]]
        : Drawable,
      lodScale,
    );

    return shape;
  };
}
