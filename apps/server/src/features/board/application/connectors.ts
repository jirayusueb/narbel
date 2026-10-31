import type { IIdGenerator } from "../../../shared/application/interfaces/IIdGenerator";
import type { Element } from "../domain/entities/Element";
import {
  attachConnector,
  connectorCapable,
  currentRefs,
  detachDeleted,
  forgetBound,
  labelIdOf,
  rerouteAround,
  withLabel,
} from "../domain/rules/bindings";
import type { ConnectorRefs } from "../domain/rules/bindings";
import { elementBounds, num, overlaps } from "../domain/rules/geometry";
import {
  hasLabelSlot,
  routeStyle,
  toStored,
} from "../domain/shapes/ElementStyle";
import type { LabelStyle, Style } from "../domain/shapes/ElementStyle";
import {
  LABEL_FOLLOWS,
  buildLabel,
  fitLabel,
  refitText,
} from "../domain/shapes/ShapeRegistry";
import type { SceneAccess } from "./ports/IBoardScenes";

// Identity, versioning and binding records belong to the system; bindings change only
// through `RebindRefs`, so a raw patch can never leave the two ends inconsistent.
const RESERVED: Record<string, true> = {
  id: true,
  type: true,
  version: true,
  versionNonce: true,
  isDeleted: true,
  updated: true,
  boundElements: true,
  startBinding: true,
  endBinding: true,
  frameId: true,
};

/** The fields a caller may change on an element. */
export type ElementPatch = Partial<Style> & {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  text?: string;
  name?: string;
  locked?: boolean;
};

export const stripReserved = (patch: Record<string, unknown>): ElementPatch =>
  // the transport's patch schema (createMcpServer) has checked every value
  Object.fromEntries(
    Object.entries(patch).filter(([key]) => !RESERVED[key])
  ) as ElementPatch;

// Browsers keep an element unless the incoming copy has a higher version, so every
// change to an element that already exists in the shared document must bump it.
export const bumped = (element: Element, ids: IIdGenerator): Element => ({
  ...element,
  version: element.version + 1,
  versionNonce: ids.int(),
  updated: Date.now(),
});

export const pageLookup = (scene: SceneAccess, pageId: string) =>
  new Map(scene.all(pageId).map((element) => [element.id, element]));

const GEOMETRY: Record<string, true> = {
  x: true,
  y: true,
  width: true,
  height: true,
  angle: true,
};

export type PatchOutcome =
  | "ok"
  | "missing"
  | "not-connector"
  | "missing-ref"
  | "locked";

/** `null` detaches that end; `undefined` keeps the current binding. */
export interface RebindRefs {
  startElementId?: string | null;
  endElementId?: string | null;
}

const resolveRefs = (
  current: ConnectorRefs,
  change: RebindRefs
): ConnectorRefs => ({
  startElementId:
    change.startElementId === undefined
      ? current.startElementId
      : (change.startElementId ?? undefined),
  endElementId:
    change.endElementId === undefined
      ? current.endElementId
      : (change.endElementId ?? undefined),
});

const rebindProblem = (
  local: Element,
  rebind: RebindRefs,
  lookup: Map<string, Element>
): PatchOutcome | undefined => {
  const changed = [rebind.startElementId, rebind.endElementId].filter(
    (ref) => ref !== undefined
  );
  if (changed.length === 0) {
    return;
  }
  if (!connectorCapable(local)) {
    return "not-connector";
  }
  // null detaches; any id must name another live element on the same page
  const invalid = changed.some(
    (ref) =>
      ref !== null && (ref === local.id || lookup.get(ref)?.isDeleted !== false)
  );
  return invalid ? "missing-ref" : undefined;
};

/** The new connector plus every other element its new bindings change. */
const rebound = (
  next: Element,
  refs: ConnectorRefs,
  lookup: Map<string, Element>,
  ids: IIdGenerator
): Element[] => {
  const attached = attachConnector(next, refs, lookup);
  const forgotten = attached.unbinds
    .map((unbound) => lookup.get(unbound))
    .filter(
      (target): target is Element => target !== undefined && !target.isDeleted
    )
    .map((target) => forgetBound(target, next.id));
  const [connector, ...targets] = attached.writes;
  return [
    connector ?? next,
    ...[...targets, ...forgotten].map((t) => bumped(t, ids)),
  ];
};

export const newIdentity = (ids: IIdGenerator, updated = Date.now()) => ({
  id: ids.generate(),
  seed: ids.int(),
  versionNonce: ids.int(),
  updated,
});

interface LabelChange {
  text?: string;
  style: LabelStyle;
  refit: boolean;
}

const relabel = (
  container: Element,
  { text, style, refit }: LabelChange,
  lookup: Map<string, Element>,
  ids: IIdGenerator
): { container: Element; writes: Element[] } => {
  const labelId = labelIdOf(container);
  const found = labelId === undefined ? undefined : lookup.get(labelId);
  const label = found?.isDeleted ? undefined : found;
  if (text === "") {
    return label
      ? {
          container: forgetBound(container, label.id),
          writes: [bumped({ ...label, isDeleted: true }, ids)],
        }
      : { container, writes: [] };
  }
  if (text !== undefined && !label) {
    const created = buildLabel(container, text, style, newIdentity(ids));
    return { container: withLabel(container, created.id), writes: [created] };
  }
  const styled = Object.keys(style).length > 0;
  if (label && (text !== undefined || styled || refit)) {
    const changed = {
      ...label,
      ...style,
      ...(text === undefined ? {} : { text, originalText: text }),
    };
    return {
      container,
      writes: [bumped(fitLabel(changed, container), ids)],
    };
  }
  return { container, writes: [] };
};

const hasOtherThanLocked = (fields: ElementPatch) =>
  Object.keys(fields).some((key) => key !== "locked");

const lockRefuses = (
  local: Element,
  wantsRebind: boolean,
  fields: ElementPatch
) => local.locked === true && (wantsRebind || hasOtherThanLocked(fields));

const restyled = (
  local: Element,
  text: string | undefined,
  own: Omit<ElementPatch, "text">,
  ids: IIdGenerator
): Element => {
  const isText = local.type === "text";
  const next = bumped(
    {
      ...local,
      ...toStored(local.type, own),
      ...(isText && typeof text === "string"
        ? { text, originalText: text }
        : {}),
    },
    ids
  );
  const measurable = isText && typeof local.containerId !== "string";
  const resized = "width" in own || "height" in own;
  const retyped = typeof text === "string" || "fontSize" in own;
  return measurable && !resized && retyped ? refitText(next) : next;
};

const released = (
  child: Element,
  lookup: Map<string, Element>,
  moved: boolean
): Element => {
  const frame =
    typeof child.frameId === "string" ? lookup.get(child.frameId) : undefined;
  const outside =
    moved &&
    frame !== undefined &&
    !frame.isDeleted &&
    !overlaps(elementBounds(child), elementBounds(frame));
  return outside ? { ...child, frameId: null } : child;
};

const isFree = (e: Element) => {
  const { startElementId, endElementId } = currentRefs(e);
  return startElementId === undefined && endElementId === undefined;
};

const childMoves = (
  lookup: Map<string, Element>,
  before: Element,
  after: Element
) => {
  const dx = num(after.x) - num(before.x);
  const dy = num(after.y) - num(before.y);
  const children =
    (dx === 0 && dy === 0) || before.type !== "frame"
      ? []
      : [...lookup.values()].filter(
          (e) =>
            e.frameId === before.id &&
            !e.isDeleted &&
            typeof e.containerId !== "string"
        );
  return [
    ...children.filter((e) => !connectorCapable(e)),
    ...children.filter((e) => connectorCapable(e) && isFree(e)),
  ].map((e) => ({
    id: e.id,
    fields: { x: num(e.x) + dx, y: num(e.y) + dy },
  }));
};

export const patchElement = (
  scene: SceneAccess,
  ids: IIdGenerator,
  id: string,
  fields: ElementPatch,
  rebind: RebindRefs = {},
  carried = false,
  sharedLookup?: Map<string, Element>
): PatchOutcome => {
  const found = scene.locate(id);
  if (!found || found.element.isDeleted) {
    return "missing";
  }
  const local = found.element;
  const lookup = sharedLookup ?? pageLookup(scene, found.pageId);
  const problem = rebindProblem(local, rebind, lookup);
  if (problem) {
    return problem;
  }
  const wantsRebind =
    rebind.startElementId !== undefined || rebind.endElementId !== undefined;
  if (!carried && lockRefuses(local, wantsRebind, fields)) {
    return "locked";
  }
  const { text, ...rest } = fields;
  const { own, label } = routeStyle(local.type, rest);
  const geometryChanged = Object.keys(own).some((key) => GEOMETRY[key]);
  const refit =
    geometryChanged || wantsRebind || LABEL_FOLLOWS.some((key) => key in own);
  const grown = restyled(local, text, own, ids);
  const next = released(grown, lookup, geometryChanged);
  const movesShape = !connectorCapable(local) && geometryChanged;
  lookup.set(next.id, next);
  const [head = next, ...others] = wantsRebind
    ? rebound(next, resolveRefs(currentRefs(local), rebind), lookup, ids)
    : [
        next,
        ...(movesShape
          ? rerouteAround(next, lookup).map((c) => bumped(c, ids))
          : []),
      ];
  const labelling = relabel(
    head,
    {
      text:
        hasLabelSlot(local.type) && typeof text === "string" ? text : undefined,
      style: label,
      refit,
    },
    lookup,
    ids
  );
  labelling.writes = labelling.writes.map((w) =>
    w.containerId === id ? { ...w, frameId: next.frameId ?? null } : w
  );
  const following = others
    .filter((c) => connectorCapable(c))
    .flatMap((c) => relabel(c, { style: {}, refit: true }, lookup, ids).writes);
  for (const write of [
    labelling.container,
    ...others,
    ...labelling.writes,
    ...following,
  ]) {
    scene.put(found.pageId, write);
    lookup.set(write.id, write);
  }
  for (const move of childMoves(lookup, local, next)) {
    patchElement(scene, ids, move.id, move.fields, {}, true, lookup);
  }
  return "ok";
};

export const deleteElement = (
  scene: SceneAccess,
  ids: IIdGenerator,
  id: string
): "ok" | "missing" | "locked" => {
  const found = scene.locate(id);
  if (!found || found.element.isDeleted) {
    return "missing";
  }
  if (found.element.locked === true) {
    return "locked";
  }
  // tombstone, so concurrent edits and late joiners converge on the deletion
  scene.put(found.pageId, bumped({ ...found.element, isDeleted: true }, ids));
  for (const write of detachDeleted(
    found.element,
    pageLookup(scene, found.pageId)
  )) {
    scene.put(found.pageId, bumped(write, ids));
  }
  return "ok";
};
