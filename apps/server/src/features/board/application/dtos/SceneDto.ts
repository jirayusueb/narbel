import type { SceneElement } from "../../domain/entities/SceneElement";
import { labelIdOf } from "../../domain/rules/bindings";
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

const boundId = (binding: unknown) =>
  (binding as { elementId?: string } | null)?.elementId ?? null;

const CONNECTOR_TYPES: Record<string, true> = { arrow: true, line: true };

const liveLabel = (
  e: SceneElement,
  get: (id: string) => SceneElement | undefined
) => {
  const labelId = labelIdOf(e);
  const label = labelId === undefined ? undefined : get(labelId);
  return label && !label.isDeleted ? label : undefined;
};
/** Sub-pixel digits cost agent tokens and mean nothing; `+ 0` turns -0 into 0. */
export const roundCoord = <T>(value: T): T =>
  (typeof value === "number" ? Math.round(value * 100) / 100 + 0 : value) as T;

export const toSceneElementDto = (
  e: SceneElement,
  get: (id: string) => SceneElement | undefined
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
    ...(content ? { text: content.text } : {}),
    ...styleDiff(e, label),
    ...(CONNECTOR_TYPES[e.type]
      ? {
          startElementId: boundId(e.startBinding),
          endElementId: boundId(e.endBinding),
        }
      : {}),
    ...(Array.isArray(e.groupIds) && e.groupIds.length > 0
      ? { groupIds: e.groupIds as string[] }
      : {}),
    ...(typeof e.frameId === "string" ? { frameId: e.frameId } : {}),
    ...(e.type === "frame" && typeof e.name === "string" && e.name !== ""
      ? { name: e.name }
      : {}),
    ...(e.locked === true ? { locked: true as const } : {}),
  };
};

/** Excalidraw's z-order: ascending fractional `index`, ties by id, unindexed last. */
export const byZOrder = (a: SceneElement, b: SceneElement) => {
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

const isLabelOfLive = (byId: Map<string, SceneElement>) => (e: SceneElement) =>
  typeof e.containerId === "string" &&
  byId.get(e.containerId)?.isDeleted === false;

const visible = (elements: SceneElement[]) => {
  const byId = new Map(elements.map((e) => [e.id, e]));
  const isLabel = isLabelOfLive(byId);
  const live = elements.filter((e) => !(e.isDeleted || isLabel(e)));
  live.sort(byZOrder);
  return { byId, live };
};

export const toSceneDtos = (
  elements: SceneElement[],
  keep: (e: SceneElement) => boolean = () => true
): SceneElementDto[] => {
  const { byId, live } = visible(elements);
  const get = (id: string) => byId.get(id);
  return live.filter(keep).map((e) => toSceneElementDto(e, get));
};
