import type { SceneElement } from "../entities/SceneElement";

// Excalidraw renders an arrow between its `points`; a binding additionally snaps it to the
// target's edge and moves it when the target moves. We approximate the snap with the target's
// bounding box, which is what a fresh arrow looks like anyway; the client's editor recomputes
// the exact elbow/edge geometry the first time either end moves.
export const GAP = 8;

export interface ConnectorRefs {
  startElementId?: string;
  endElementId?: string;
}

interface Point {
  x: number;
  y: number;
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

const isMissing = (value: unknown): value is undefined | null =>
  value === undefined || value === null;

const boxOf = (element: SceneElement): Box => ({
  x: Number(element.x),
  y: Number(element.y),
  width: Number(element.width),
  height: Number(element.height),
});

const center = (box: Box): Point => ({
  x: box.x + box.width / 2,
  y: box.y + box.height / 2,
});

/** Where the line from the box center toward `other` crosses the box edge, plus the gap. */
const edgeToward = (box: Box, other: Point): Point => {
  const c = center(box);
  const dx = other.x - c.x;
  const dy = other.y - c.y;
  if (dx === 0 && dy === 0) {
    return c;
  }
  // distance from center to the box border along (dx, dy)
  const scale = Math.min(
    Math.abs(box.width / 2 / (dx || Number.EPSILON)),
    Math.abs(box.height / 2 / (dy || Number.EPSILON))
  );
  const length = Math.hypot(dx, dy) || 1;
  return {
    x: c.x + dx * scale + (dx / length) * GAP,
    y: c.y + dy * scale + (dy / length) * GAP,
  };
};

const rounded = (value: number) => Math.round(value * 100) / 100;

const CONNECTOR_TYPES: Record<string, true> = { arrow: true, line: true };

const isConnector = (element: SceneElement) =>
  Boolean(CONNECTOR_TYPES[element.type]);

const binding = (elementId: string) => ({
  elementId,
  focus: 0,
  gap: 1,
});

const withBoundElements = (
  target: SceneElement,
  connectorId: string,
  connectorType: string
): SceneElement => {
  const existing = Array.isArray(target.boundElements)
    ? (target.boundElements as { id: string; type: string }[])
    : [];
  if (existing.some((entry) => entry.id === connectorId)) {
    return target;
  }
  return {
    ...target,
    boundElements: [...existing, { id: connectorId, type: connectorType }],
  };
};

/** Drops a connector or label from a target's `boundElements`. */
export const forgetBound = (
  target: SceneElement,
  boundId: string
): SceneElement => ({
  ...target,
  boundElements: Array.isArray(target.boundElements)
    ? (target.boundElements as { id: string }[]).filter(
        (entry) => entry.id !== boundId
      )
    : null,
});

// a binding to a deleted element would be dangling, so the end stays free instead
const resolveTarget = (
  id: string | undefined,
  targets: Map<string, SceneElement>
) => {
  const target = isMissing(id) ? undefined : targets.get(id);
  return target?.isDeleted ? undefined : target;
};

/** The connector's current free ends: its origin and the tip of its last point. */
const freeEnds = (connector: SceneElement) => {
  const points = (connector.points as number[][] | undefined) ?? [
    [0, 0],
    [Number(connector.width), Number(connector.height)],
  ];
  const origin = { x: Number(connector.x), y: Number(connector.y) };
  const last = points.at(-1) ?? [0, 0];
  return {
    origin,
    tip: { x: origin.x + (last[0] ?? 0), y: origin.y + (last[1] ?? 0) },
  };
};

const routeBetween = (
  connector: SceneElement,
  start: SceneElement | undefined,
  end: SceneElement | undefined
) => {
  const { origin, tip } = freeEnds(connector);
  const startPoint = start
    ? edgeToward(boxOf(start), end ? center(boxOf(end)) : tip)
    : origin;
  const endPoint = end
    ? edgeToward(boxOf(end), start ? center(boxOf(start)) : startPoint)
    : tip;
  const dx = rounded(endPoint.x - startPoint.x);
  const dy = rounded(endPoint.y - startPoint.y);
  return {
    x: rounded(startPoint.x),
    y: rounded(startPoint.y),
    // Excalidraw keeps width/height as absolute bounds; direction lives in `points`
    width: Math.abs(dx),
    height: Math.abs(dy),
    points: [
      [0, 0],
      [dx, dy],
    ],
  };
};

/** Targets the connector was bound to before that it no longer binds. */
const droppedTargets = (
  connector: SceneElement,
  keep: (string | undefined)[]
) =>
  [connector.startBinding, connector.endBinding]
    .map((value) => (value as { elementId?: string } | null)?.elementId)
    .filter((id): id is string => id !== undefined && !keep.includes(id));

/**
 * Applies start/end element references to a connector and returns the elements to
 * write: the connector (geometry + bindings) first, then each target with the connector
 * registered in `boundElements`; `unbinds` lists former targets that must forget it.
 * `targets` must already contain every referenced element.
 */
export const attachConnector = (
  connector: SceneElement,
  refs: ConnectorRefs,
  targets: Map<string, SceneElement>
): { writes: SceneElement[]; unbinds: string[] } => {
  const start = resolveTarget(refs.startElementId, targets);
  const end = resolveTarget(refs.endElementId, targets);
  const bound: SceneElement = {
    ...connector,
    ...routeBetween(connector, start, end),
    startBinding: start ? binding(start.id) : null,
    endBinding: end ? binding(end.id) : null,
  };
  const attached = [start, end]
    .filter((target): target is SceneElement => target !== undefined)
    .map((target) => withBoundElements(target, bound.id, bound.type));
  return {
    writes: [bound, ...attached],
    unbinds: droppedTargets(connector, [start?.id, end?.id]),
  };
};

export const connectorCapable = isConnector;

const boundIdOf = (value: unknown) =>
  (value as { elementId?: string } | null)?.elementId;

/** The start/end refs a connector is currently bound to. */
export const currentRefs = (connector: SceneElement): ConnectorRefs => ({
  startElementId: boundIdOf(connector.startBinding),
  endElementId: boundIdOf(connector.endBinding),
});

const boundEntries = (element: SceneElement) =>
  Array.isArray(element.boundElements)
    ? (element.boundElements as { id: string; type: string }[])
    : [];

/** Id of the text bound inside a shape, if it has one. */
export const labelIdOf = (container: SceneElement): string | undefined =>
  boundEntries(container).find((entry) => entry.type === "text")?.id;

/** The container listing `labelId` as its only bound text. */
export const withLabel = (
  container: SceneElement,
  labelId: string
): SceneElement => ({
  ...container,
  boundElements: [
    ...boundEntries(container).filter((entry) => entry.type !== "text"),
    { id: labelId, type: "text" },
  ],
});

/** Connectors attached to `target`, re-routed to its current geometry. */
export const rerouteAround = (
  target: SceneElement,
  lookup: Map<string, SceneElement>
): SceneElement[] =>
  boundEntries(target)
    .map((entry) => lookup.get(entry.id))
    .filter(
      (connector): connector is SceneElement =>
        connector !== undefined &&
        !connector.isDeleted &&
        isConnector(connector)
    )
    .map((connector) => {
      const [rerouted] = attachConnector(
        connector,
        currentRefs(connector),
        lookup
      ).writes;
      return rerouted ?? connector;
    });

/**
 * What else must change when `deleted` goes away: a deleted connector leaves its
 * targets' `boundElements` and takes its label along, a deleted label leaves its
 * container's, a deleted frame releases its children (as Excalidraw's delete action does),
 * and a deleted shape unbinds every connector attached to it and takes its label along.
 */
export const detachDeleted = (
  deleted: SceneElement,
  lookup: Map<string, SceneElement>
): SceneElement[] => {
  const live = (id: string | undefined) => {
    const element = id === undefined ? undefined : lookup.get(id);
    return element?.isDeleted ? undefined : element;
  };
  if (deleted.type === "frame") {
    return [...lookup.values()]
      .filter((e) => !e.isDeleted && e.frameId === deleted.id)
      .map((child) => ({ ...child, frameId: null }));
  }
  if (isConnector(deleted)) {
    const { startElementId, endElementId } = currentRefs(deleted);
    const label = live(labelIdOf(deleted));
    return [
      ...[startElementId, endElementId]
        .map(live)
        .filter((t): t is SceneElement => t !== undefined)
        .map((target) => forgetBound(target, deleted.id)),
      ...(label ? [{ ...label, isDeleted: true }] : []),
    ];
  }
  if (typeof deleted.containerId === "string") {
    const container = live(deleted.containerId);
    return container ? [forgetBound(container, deleted.id)] : [];
  }
  return boundEntries(deleted)
    .map((entry) => live(entry.id))
    .filter((bound): bound is SceneElement => bound !== undefined)
    .flatMap((bound): SceneElement[] => {
      if (isConnector(bound)) {
        return [
          {
            ...bound,
            startBinding:
              boundIdOf(bound.startBinding) === deleted.id
                ? null
                : bound.startBinding,
            endBinding:
              boundIdOf(bound.endBinding) === deleted.id
                ? null
                : bound.endBinding,
          },
        ];
      }
      return bound.containerId === deleted.id
        ? [{ ...bound, isDeleted: true }]
        : [];
    });
};
