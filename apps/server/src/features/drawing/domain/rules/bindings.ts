import { connectorTarget, labelIdOf } from "../entities/Drawing";
import type { Element } from "../entities/Element";

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

const boxOf = (element: Element): Box => ({
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

const isConnector = (element: Element) =>
  Boolean(CONNECTOR_TYPES[element.type]);

const binding = (elementId: string) => ({
  elementId,
  focus: 0,
  gap: 1,
});

const withBoundElements = (
  target: Element,
  connectorId: string,
  connectorType: string
): Element => {
  const existing = target.boundElements ?? [];
  if (existing.some((entry) => entry.id === connectorId)) {
    return target;
  }
  return {
    ...target,
    boundElements: [...existing, { id: connectorId, type: connectorType }],
  };
};

/** Drops a connector or label from a target's `boundElements`. */
export const forgetBound = (target: Element, boundId: string): Element => ({
  ...target,
  boundElements:
    target.boundElements?.filter((entry) => entry.id !== boundId) ?? null,
});

/** The connector's current free ends: its origin and the tip of its last point. */
const freeEnds = (connector: Element) => {
  const points = connector.points ?? [
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
  connector: Element,
  start: Element | undefined,
  end: Element | undefined
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
const droppedTargets = (connector: Element, keep: (string | undefined)[]) =>
  [connector.startBinding, connector.endBinding]
    .map((value) => value?.elementId)
    .filter((id): id is string => id !== undefined && !keep.includes(id));

/**
 * Applies start/end element references to a connector and returns the elements to
 * write: the connector (geometry + bindings) first, then each target with the connector
 * registered in `boundElements`; `unbinds` lists former targets that must forget it.
 * `targets` must already contain every referenced element.
 */
export const attachConnector = (
  connector: Element,
  refs: ConnectorRefs,
  targets: Map<string, Element>
): { writes: Element[]; unbinds: string[] } => {
  // a binding to a deleted element would be dangling, so the end stays free instead
  const start = connectorTarget(refs.startElementId, targets);
  const end = connectorTarget(refs.endElementId, targets);
  const bound: Element = {
    ...connector,
    ...routeBetween(connector, start, end),
    startBinding: start ? binding(start.id) : null,
    endBinding: end ? binding(end.id) : null,
  };
  const attached = [start, end]
    .filter((target): target is Element => target !== undefined)
    .map((target) => withBoundElements(target, bound.id, bound.type));
  return {
    writes: [bound, ...attached],
    unbinds: droppedTargets(connector, [start?.id, end?.id]),
  };
};

export const connectorCapable = isConnector;

/** The start/end refs a connector is currently bound to. */
export const currentRefs = (connector: Element): ConnectorRefs => ({
  startElementId: connector.startBinding?.elementId,
  endElementId: connector.endBinding?.elementId,
});

/** Connectors attached to `target`, re-routed to its current geometry. */
export const rerouteAround = (
  target: Element,
  lookup: Map<string, Element>
): Element[] =>
  (target.boundElements ?? [])
    .map((entry) => lookup.get(entry.id))
    .filter(
      (connector): connector is Element =>
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

export const detachDeleted = (
  deleted: Element,
  lookup: Map<string, Element>
): Element[] => {
  const live = (id: string | undefined) => {
    const element = id === undefined ? undefined : lookup.get(id);
    return element?.isDeleted ? undefined : element;
  };
  const isChild = (e: Element) =>
    deleted.type === "frame" && !e.isDeleted && e.frameId === deleted.id;
  const released = [...lookup.values()].filter(isChild);
  if (isConnector(deleted)) {
    const { startElementId, endElementId } = currentRefs(deleted);
    const label = live(labelIdOf(deleted));
    return [
      ...[startElementId, endElementId]
        .map(live)
        .filter((t): t is Element => t !== undefined)
        .map((target) => forgetBound(target, deleted.id)),
      ...(label ? [{ ...label, isDeleted: true }] : []),
    ];
  }
  if (typeof deleted.containerId === "string") {
    const container = live(deleted.containerId);
    return container ? [forgetBound(container, deleted.id)] : [];
  }
  const unbound = (deleted.boundElements ?? [])
    .map((entry) => live(entry.id))
    .filter((bound): bound is Element => bound !== undefined)
    .flatMap((bound): Element[] => {
      if (isConnector(bound)) {
        return [
          {
            ...bound,
            startBinding:
              bound.startBinding?.elementId === deleted.id
                ? null
                : bound.startBinding,
            endBinding:
              bound.endBinding?.elementId === deleted.id
                ? null
                : bound.endBinding,
          },
        ];
      }
      return bound.containerId === deleted.id
        ? [{ ...bound, isDeleted: true }]
        : [];
    });
  const written = new Set(unbound.map((e) => e.id));
  return [...released.filter((e) => !written.has(e.id)), ...unbound].map((e) =>
    isChild(e) ? { ...e, frameId: null } : e
  );
};
