import type { IIdGenerator } from "../../../shared/application/interfaces/IIdGenerator";
import type { SceneElement } from "../domain/entities/SceneElement";
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
import { LABELLED, buildLabel, fitLabel } from "../domain/shapes/ShapeRegistry";
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
};

export const stripReserved = (patch: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(patch).filter(([key]) => !RESERVED[key]));

// Browsers keep an element unless the incoming copy has a higher version, so every
// change to an element that already exists in the shared document must bump it.
export const bumped = (
  element: SceneElement,
  ids: IIdGenerator
): SceneElement => ({
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

export type PatchOutcome = "ok" | "missing" | "not-connector" | "missing-ref";

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
  local: SceneElement,
  rebind: RebindRefs,
  lookup: Map<string, SceneElement>
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
  next: SceneElement,
  refs: ConnectorRefs,
  lookup: Map<string, SceneElement>,
  ids: IIdGenerator
): SceneElement[] => {
  const attached = attachConnector(next, refs, lookup);
  const forgotten = attached.unbinds
    .map((unbound) => lookup.get(unbound))
    .filter(
      (target): target is SceneElement =>
        target !== undefined && !target.isDeleted
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

/**
 * The container after its label changes, and the label writes that takes: `text` sets
 * the label (`""` removes it), `refit` re-centers it after the container moved or resized.
 */
const relabel = (
  container: SceneElement,
  text: string | undefined,
  refit: boolean,
  lookup: Map<string, SceneElement>,
  ids: IIdGenerator
): { container: SceneElement; writes: SceneElement[] } => {
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
    const created = buildLabel(container, text, newIdentity(ids));
    return { container: withLabel(container, created.id), writes: [created] };
  }
  if (label && (text !== undefined || refit)) {
    const changed =
      text === undefined ? label : { ...label, text, originalText: text };
    return {
      container,
      writes: [bumped(fitLabel(changed, container), ids)],
    };
  }
  return { container, writes: [] };
};

/**
 * Writes `fields` over the element as a new version and keeps connectors and labels
 * consistent: rebinding a connector updates both ends' `boundElements`, moving or
 * resizing a shape re-routes the connectors attached to it and re-centers its label,
 * and `text` on a rectangle/ellipse/diamond sets that label.
 */
export const patchElement = (
  scene: SceneAccess,
  ids: IIdGenerator,
  id: string,
  fields: Record<string, unknown>,
  rebind: RebindRefs = {}
): PatchOutcome => {
  const found = scene.find(id);
  if (!found || found.element.isDeleted) {
    return "missing";
  }
  const local = found.element;
  const lookup = pageLookup(scene, found.pageId);
  const problem = rebindProblem(local, rebind, lookup);
  if (problem) {
    return problem;
  }
  const labelled = Boolean(LABELLED[local.type]);
  // a shape's text lives in its bound label, never on the shape itself
  const { text, ...shapeFields } = fields;
  const geometryChanged = Object.keys(fields).some((key) => GEOMETRY[key]);
  const labelling = relabel(
    bumped(
      {
        ...local,
        ...(labelled ? shapeFields : fields),
        ...(local.type === "text" && typeof text === "string"
          ? { originalText: text }
          : {}),
      },
      ids
    ),
    labelled && typeof text === "string" ? text : undefined,
    labelled && geometryChanged,
    lookup,
    ids
  );
  const next = labelling.container;
  const wantsRebind =
    rebind.startElementId !== undefined || rebind.endElementId !== undefined;
  const movesShape = !connectorCapable(local) && geometryChanged;
  lookup.set(next.id, next);
  const writes = wantsRebind
    ? rebound(next, resolveRefs(currentRefs(local), rebind), lookup, ids)
    : [
        next,
        ...(movesShape
          ? rerouteAround(next, lookup).map((c) => bumped(c, ids))
          : []),
      ];
  for (const write of [...writes, ...labelling.writes]) {
    scene.put(found.pageId, write);
  }
  return "ok";
};

/** Tombstones the element and detaches whatever was bound to it. */
export const deleteElement = (
  scene: SceneAccess,
  ids: IIdGenerator,
  id: string
): boolean => {
  const found = scene.find(id);
  if (!found || found.element.isDeleted) {
    return false;
  }
  // tombstone, so concurrent edits and late joiners converge on the deletion
  scene.put(found.pageId, bumped({ ...found.element, isDeleted: true }, ids));
  for (const write of detachDeleted(
    found.element,
    pageLookup(scene, found.pageId)
  )) {
    scene.put(found.pageId, bumped(write, ids));
  }
  return true;
};
