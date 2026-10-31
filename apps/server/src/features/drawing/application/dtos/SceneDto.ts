import { labelIdOf } from "../../domain/entities/Drawing";
import type { Element } from "../../domain/entities/Element";
import { styleDiff } from "../../domain/shapes/ElementStyle";
import type { Style } from "../../domain/shapes/ElementStyle";

export interface SceneElementDto extends Partial<Style> {
  id: string;
  type: string;
  x: unknown;
  y: unknown;
  width: unknown;
  height: unknown;
  text?: unknown;
  /** arrows/lines: what each end is attached to, so agents can read the diagram's graph */
  startElementId?: string | null;
  endElementId?: string | null;
  groupIds?: string[];
  frameId?: string;
  name?: string;
  locked?: true;
}

export interface SceneDto {
  title: string;
  pageId: string;
  total: number;
  truncated: boolean;
  elements: SceneElementDto[];
}

const CONNECTOR_TYPES: Record<string, true> = { arrow: true, line: true };

const liveLabel = (e: Element, get: (id: string) => Element | undefined) => {
  const labelId = labelIdOf(e);
  const label = labelId === undefined ? undefined : get(labelId);
  return label && !label.isDeleted ? label : undefined;
};
/** Sub-pixel digits cost agent tokens and mean nothing; `+ 0` turns -0 into 0. */
export const roundCoord = <T>(value: T): T =>
  (typeof value === "number" ? Math.round(value * 100) / 100 + 0 : value) as T;

export const toSceneElementDto = (
  e: Element,
  get: (id: string) => Element | undefined
): SceneElementDto => {
  const label = liveLabel(e, get);
  const content = e.type === "text" ? e : label;
  return {
    id: e.id,
    type: e.type,
    x: roundCoord(e.x),
    y: roundCoord(e.y),
    width: roundCoord(e.width),
    height: roundCoord(e.height),
    ...(content ? { text: content.originalText ?? content.text } : {}),
    ...styleDiff(e, label),
    ...(CONNECTOR_TYPES[e.type]
      ? {
          startElementId: e.startBinding?.elementId ?? null,
          endElementId: e.endBinding?.elementId ?? null,
        }
      : {}),
    ...(e.groupIds && e.groupIds.length > 0 ? { groupIds: e.groupIds } : {}),
    ...(typeof e.frameId === "string" ? { frameId: e.frameId } : {}),
    ...(e.type === "frame" && typeof e.name === "string" && e.name !== ""
      ? { name: e.name }
      : {}),
    ...(e.locked === true ? { locked: true as const } : {}),
  };
};

/** Excalidraw's z-order: ascending fractional `index`, ties by id, unindexed last. */
export const byZOrder = (a: Element, b: Element) => {
  const ai = a.index;
  const bi = b.index;
  if (ai === bi) {
    return a.id < b.id ? -1 : 1;
  }
  if (ai === undefined || bi === undefined) {
    return ai === undefined ? 1 : -1;
  }
  return ai < bi ? -1 : 1;
};

const isLabelOfLive = (byId: Map<string, Element>) => (e: Element) =>
  typeof e.containerId === "string" &&
  byId.get(e.containerId)?.isDeleted === false;

const visible = (elements: Element[]) => {
  const byId = new Map(elements.map((e) => [e.id, e]));
  const isLabel = isLabelOfLive(byId);
  const live = elements.filter((e) => !(e.isDeleted || isLabel(e)));
  live.sort(byZOrder);
  return { byId, live };
};

export const toSceneDtos = (
  elements: Element[],
  keep: (e: Element) => boolean = () => true
): SceneElementDto[] => {
  const { byId, live } = visible(elements);
  const get = (id: string) => byId.get(id);
  return live.filter(keep).map((e) => toSceneElementDto(e, get));
};
