import type { SceneElement } from "../../domain/entities/SceneElement";
import { labelIdOf } from "../../domain/rules/bindings";
import {
  DEFAULT_BACKGROUND,
  DEFAULT_STROKE,
} from "../../domain/shapes/ShapeRegistry";

/** Colors equal to the defaults and labels' own elements are left out to keep agent reads small. */
export interface SceneElementDto {
  id: string;
  type: string;
  x: unknown;
  y: unknown;
  width: unknown;
  height: unknown;
  /** a text element's content, or the label inside a rectangle/ellipse/diamond */
  text?: unknown;
  strokeColor?: unknown;
  backgroundColor?: unknown;
  /** arrows/lines: what each end is attached to, so agents can read the diagram's graph */
  startElementId?: string | null;
  endElementId?: string | null;
}

export interface SceneDto {
  title: string;
  pageId: string;
  elements: SceneElementDto[];
}

const boundId = (binding: unknown) =>
  (binding as { elementId?: string } | null)?.elementId ?? null;

const CONNECTOR_TYPES: Record<string, true> = { arrow: true, line: true };

const labelText = (
  e: SceneElement,
  get: (id: string) => SceneElement | undefined
) => {
  const labelId = labelIdOf(e);
  const label = labelId === undefined ? undefined : get(labelId);
  return label && !label.isDeleted ? { text: label.text } : {};
};
/** Sub-pixel digits cost agent tokens and mean nothing; `+ 0` turns -0 into 0. */
export const roundCoord = <T>(value: T): T =>
  (typeof value === "number" ? Math.round(value * 100) / 100 + 0 : value) as T;

/** `get` resolves the element's bound label, whose text is reported on the shape. */
export const toSceneElementDto = (
  e: SceneElement,
  get: (id: string) => SceneElement | undefined
): SceneElementDto => ({
  id: e.id,
  type: e.type,
  x: roundCoord(e.x),
  y: roundCoord(e.y),
  width: roundCoord(e.width),
  height: roundCoord(e.height),
  ...(e.type === "text" ? { text: e.text } : labelText(e, get)),
  ...(e.strokeColor === DEFAULT_STROKE ? {} : { strokeColor: e.strokeColor }),
  ...(e.backgroundColor === DEFAULT_BACKGROUND
    ? {}
    : { backgroundColor: e.backgroundColor }),
  ...(CONNECTOR_TYPES[e.type]
    ? {
        startElementId: boundId(e.startBinding),
        endElementId: boundId(e.endBinding),
      }
    : {}),
});

/** Excalidraw's z-order: ascending fractional `index`, ties by id, unindexed last. */
const byZOrder = (a: SceneElement, b: SceneElement) => {
  const ai = typeof a.index === "string" ? a.index : undefined;
  const bi = typeof b.index === "string" ? b.index : undefined;
  if (ai === bi) {
    return a.id < b.id ? -1 : 1;
  }
  if (ai === undefined || bi === undefined) {
    return ai === undefined ? 1 : -1;
  }
  return ai < bi ? -1 : 1;
};

/**
 * Live elements of a page bottom to top; a label shows up as its shape's `text`, not on
 * its own.
 */
export const toSceneDtos = (elements: SceneElement[]): SceneElementDto[] => {
  const byId = new Map(elements.map((e) => [e.id, e]));
  const get = (id: string) => byId.get(id);
  const isLabel = (e: SceneElement) =>
    typeof e.containerId === "string" &&
    byId.get(e.containerId)?.isDeleted === false;
  const live = elements.filter((e) => !(e.isDeleted || isLabel(e)));
  live.sort(byZOrder);
  return live.map((e) => toSceneElementDto(e, get));
};
