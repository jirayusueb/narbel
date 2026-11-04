import type {
  ExcalidrawElement,
  NonDeletedExcalidrawElement,
  NonDeleted,
} from "./types";
import { isInvisiblySmallElement } from "./size-helpers";
import { isLinearElementType } from "./type-checks";

export {
  newElement,
  newTextElement,
  refreshTextDimensions,
  newLinearElement,
  newArrowElement,
  newImageElement,
  duplicateElement,
} from "./new-element";
export {
  getElementAbsoluteCoords,
  getElementBounds,
  getCommonBounds,
  getDiamondPoints,
  getArrowheadPoints,
  getClosestElementBounds,
} from "./bounds";

export {
  OMIT_SIDES_FOR_MULTIPLE_ELEMENTS,
  getTransformHandlesFromCoords,
  getTransformHandles,
} from "./transform-handles";
export {
  resizeTest,
  getCursorForResizingElement,
  getElementWithTransformHandleType,
  getTransformHandleTypeFromCoords,
} from "./resize-test";
export {
  transformElements,
  getResizeOffsetXY,
  getResizeArrowDirection,
} from "./resize-elements";
export {
  dragSelectedElements,
  getDragOffsetXY,
  dragNewElement,
} from "./drag-elements";
export { isTextElement, isExcalidrawElement } from "./type-checks";
export { redrawTextBoundingBox, getTextFromElements } from "./text-element";
export {
  getPerfectElementSize,
  getLockedLinearCursorAlignSize,
  isInvisiblySmallElement,
  resizePerfectLineForNWHandler,
  getNormalizedDimensions,
} from "./size-helpers";
export { showSelectedShapeActions } from "./show-selected-shape-actions";

/**
 * @deprecated unsafe, use hashElementsVersion instead
 */
export const getSceneVersion = (elements: readonly ExcalidrawElement[]) =>
  elements.reduce((acc, el) => acc + el.version, 0);

/**
 * Hashes elements' versionNonce (using djb2 algo). Order of elements matters.
 */
export const hashElementsVersion = (
  elements: readonly ExcalidrawElement[],
): number => {
  let hash = 5381;
  for (let i = 0; i < elements.length; i++) {
    hash = (hash << 5) + hash + elements[i].versionNonce;
  }
  return hash >>> 0; // Ensure unsigned 32-bit integer
};

// string hash function (using djb2). Not cryptographically secure, use only
// for versioning and such.
export const hashString = (s: string): number => {
  let hash: number = 5381;
  for (let i = 0; i < s.length; i++) {
    const char: number = s.charCodeAt(i);
    hash = (hash << 5) + hash + char;
  }
  return hash >>> 0; // Ensure unsigned 32-bit integer
};

export const getVisibleElements = (elements: readonly ExcalidrawElement[]) =>
  elements.filter(
    (el) => !el.isDeleted && !isInvisiblySmallElement(el),
  ) as readonly NonDeletedExcalidrawElement[];

export const getNonDeletedElements = <T extends ExcalidrawElement>(
  elements: readonly T[],
) =>
  elements.filter((element) => !element.isDeleted) as readonly NonDeleted<T>[];

export const isNonDeletedElement = <T extends ExcalidrawElement>(
  element: T,
): element is NonDeleted<T> => !element.isDeleted;

const _clearElements = (
  elements: readonly ExcalidrawElement[],
): ExcalidrawElement[] =>
  getNonDeletedElements(elements).map((element) =>
    isLinearElementType(element.type)
      ? { ...element, lastCommittedPoint: null }
      : element,
  );

export const clearElementsForDatabase = (
  elements: readonly ExcalidrawElement[],
) => _clearElements(elements);

export const clearElementsForExport = (
  elements: readonly ExcalidrawElement[],
) => _clearElements(elements);

export const clearElementsForLocalStorage = (
  elements: readonly ExcalidrawElement[],
) => _clearElements(elements);
