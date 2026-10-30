import type { IIdGenerator } from "../../../../shared/application/interfaces/IIdGenerator";
import { AppError } from "../../../../shared/kernel/errors/AppError";
import { err, ok } from "../../../../shared/kernel/types/Result";
import type { Result } from "../../../../shared/kernel/types/Result";
import { resolvePage } from "../../domain/entities/Page";
import type { SceneElement } from "../../domain/entities/SceneElement";
import {
  attachConnector,
  connectorCapable,
  withLabel,
} from "../../domain/rules/bindings";
import { box, elementBounds, union } from "../../domain/rules/geometry";
import type { Bounds } from "../../domain/rules/geometry";
import {
  FRAME_PADDING,
  besideContent,
  layered,
  wrapFrame,
} from "../../domain/rules/layout";
import type { LayoutDirection } from "../../domain/rules/layout";
import {
  STYLE,
  hasLabelSlot,
  misplacedStyle,
  pickStyle,
  routeStyle,
} from "../../domain/shapes/ElementStyle";
import {
  buildElement,
  buildLabel,
  measure,
} from "../../domain/shapes/ShapeRegistry";
import type { Shape } from "../../domain/shapes/ShapeRegistry";
import type { Actor, BoardAccessGuard } from "../BoardAccess";
import { bumped, newIdentity } from "../connectors";
import type { IBoardScenes, SceneAccess } from "../ports/IBoardScenes";

type AddOutcome =
  | "ok"
  | "no-page"
  | "id-taken"
  | "not-connector"
  | "missing-ref"
  | "connector-text"
  | "connector-position"
  | "bad-style"
  | "missing-frame"
  | "nested-frame"
  | "frame-geometry"
  | "frame-empty";

const FAILURES: Record<
  Exclude<AddOutcome, "ok">,
  (detail?: string) => AppError
> = {
  "no-page": () => AppError.notFound("Page"),
  "id-taken": () =>
    AppError.validation("An element with that id already exists on the board"),
  "not-connector": () =>
    AppError.validation(
      "startElementId/endElementId apply to arrows and lines only"
    ),
  "missing-ref": () =>
    AppError.validation(
      "startElementId/endElementId must reference an element on the page or in the same call"
    ),
  "connector-text": () =>
    AppError.validation(
      "text applies to rectangle, ellipse, diamond, arrow and text elements, not lines"
    ),
  "connector-position": () =>
    AppError.validation(
      "an arrow or line needs x and y unless both startElementId and endElementId are set"
    ),
  "bad-style": (detail) =>
    AppError.validation(
      detail ?? "a style field does not apply to its element"
    ),
  "missing-frame": () =>
    AppError.validation(
      "frameId must reference a frame on the page or in the same call"
    ),
  "nested-frame": () =>
    AppError.validation("a frame cannot sit inside a frame"),
  "frame-geometry": () =>
    AppError.validation(
      "a frame gives all of x, y, width and height, or none of them to wrap its children"
    ),
  "frame-empty": () =>
    AppError.validation(
      "a frame without x/y/width/height needs at least one element with its frameId in the same call"
    ),
};

// keeps an auto-laid-out batch clear of what is already on the page
const CLEARANCE = 120;

interface Built {
  shape: Shape;
  element: SceneElement;
}

const isPlaced = (shape: Shape) =>
  shape.x !== undefined && shape.y !== undefined;

const GEOMETRY_KEYS = ["x", "y", "width", "height"] as const;

const shapeProblem = ({
  shape,
  element,
}: Built):
  | { outcome: Exclude<AddOutcome, "ok">; detail?: string }
  | undefined => {
  const misplaced = misplacedStyle(shape.type, pickStyle(shape));
  if (misplaced) {
    const where =
      STYLE[misplaced].on === "arrow"
        ? "arrows only"
        : "text, rectangle, ellipse, diamond and arrow elements only";
    return {
      outcome: "bad-style",
      detail: `${misplaced} applies to ${where}, not ${shape.type}`,
    };
  }
  if (shape.type === "frame") {
    const given = GEOMETRY_KEYS.filter((key) => shape[key] !== undefined);
    if (shape.frameId !== undefined) {
      return { outcome: "nested-frame" };
    }
    return given.length === 0 || given.length === GEOMETRY_KEYS.length
      ? undefined
      : { outcome: "frame-geometry" };
  }
  if (!connectorCapable(element)) {
    return;
  }
  if (shape.text !== undefined && element.type === "line") {
    return { outcome: "connector-text" };
  }
  const bothEnds =
    shape.startElementId !== undefined && shape.endElementId !== undefined;
  return isPlaced(shape) || bothEnds
    ? undefined
    : { outcome: "connector-position" };
};

const live = (e: SceneElement) => !e.isDeleted;

/**
 * Lays out the shapes given without x/y as a flowchart along the batch's arrows, per frame:
 * loose shapes of a sized frame go inside it, those of a frame without geometry or of the
 * page go to the right of everything already placed (the frame is fitted around them later).
 * shortcut: a laid-out group is not checked against the size of its sized frame.
 */
const arrange = (
  batch: Built[],
  existing: SceneElement[],
  direction: LayoutDirection = "down"
): Built[] => {
  const loose = batch.filter(
    ({ shape, element }) =>
      !(
        isPlaced(shape) ||
        connectorCapable(element) ||
        element.type === "frame"
      )
  );
  if (loose.length === 0) {
    return batch;
  }
  const byId = new Map(
    [...existing.filter(live), ...batch.map((b) => b.element)].map((e) => [
      e.id,
      e,
    ])
  );
  const unsized = new Set(
    batch
      .filter(({ shape }) => shape.type === "frame" && !isPlaced(shape))
      .map(({ element }) => element.id)
  );
  const fixed: Bounds[] = [
    ...existing.filter(live),
    ...batch.filter(({ shape }) => isPlaced(shape)).map((b) => b.element),
  ].map(box);
  const groups = new Map<string | undefined, Built[]>();
  for (const built of loose) {
    groups.set(built.shape.frameId, [
      ...(groups.get(built.shape.frameId) ?? []),
      built,
    ]);
  }
  const at = new Map<string, { x: number; y: number }>();
  for (const [frameId, members] of groups) {
    const ids = new Set(members.map(({ element }) => element.id));
    const edges = batch.flatMap(
      ({ shape: { startElementId, endElementId, text, fontSize } }) =>
        startElementId &&
        endElementId &&
        ids.has(startElementId) &&
        ids.has(endElementId)
          ? [
              {
                from: startElementId,
                to: endElementId,
                label: text
                  ? measure(text, fontSize ?? STYLE.fontSize.default)
                  : undefined,
              },
            ]
          : []
    );
    const positions = layered(
      members.map(({ element }) => ({
        id: element.id,
        width: Number(element.width),
        height: Number(element.height),
      })),
      edges,
      direction
    );
    const frame = frameId === undefined ? undefined : byId.get(frameId);
    const inside = frame !== undefined && !unsized.has(frame.id);
    const pad = frameId === undefined ? 0 : FRAME_PADDING;
    const start = inside
      ? { left: Number(frame.x) + pad, top: Number(frame.y) + pad }
      : (() => {
          const beside = besideContent(fixed, CLEARANCE);
          return { left: beside.left + pad, top: beside.top + pad };
        })();
    const placed = members.map(({ element }) => {
      const p = positions.get(element.id) ?? { x: 0, y: 0 };
      const x = start.left + p.x;
      const y = start.top + p.y;
      at.set(element.id, { x, y });
      return {
        x,
        y,
        width: Number(element.width),
        height: Number(element.height),
      };
    });
    if (!inside) {
      fixed.push(pad === 0 ? union(placed) : wrapFrame(placed));
    }
  }
  return batch.map((built) => {
    const p = at.get(built.element.id);
    return p ? { ...built, element: { ...built.element, ...p } } : built;
  });
};

/** Page of the first existing element a connector in the batch references. */
const referencedPageId = (batch: Built[], scene: SceneAccess) =>
  batch
    .flatMap(({ shape }) => [shape.startElementId, shape.endElementId])
    .map((ref) => (ref === undefined ? undefined : scene.find(ref)?.pageId))
    .find((pageId) => pageId !== undefined);

const referenceProblem = (
  batch: Built[],
  known: Map<string, SceneElement>
): Exclude<AddOutcome, "ok"> | undefined => {
  for (const { shape, element } of batch) {
    const refs = [shape.startElementId, shape.endElementId];
    if (refs.some((ref) => ref !== undefined)) {
      if (!connectorCapable(element)) {
        return "not-connector";
      }
      if (refs.some((ref) => ref !== undefined && !known.has(ref))) {
        return "missing-ref";
      }
    }
    if (shape.frameId !== undefined) {
      const frame = known.get(shape.frameId);
      if (frame?.type !== "frame" || frame.isDeleted) {
        return "missing-frame";
      }
    }
  }
  const hasChildren = ({ element }: Built) =>
    batch.some(({ shape }) => shape.frameId === element.id);
  return batch.some(
    (built) =>
      built.shape.type === "frame" &&
      !isPlaced(built.shape) &&
      !hasChildren(built)
  )
    ? "frame-empty"
    : undefined;
};

/** Attaches every connector of the batch in memory; `touched` collects what changed. */
const attachAll = (
  placed: Built[],
  known: Map<string, SceneElement>,
  touched: Set<string>
) => {
  for (const { shape, element } of placed) {
    if (
      shape.startElementId === undefined &&
      shape.endElementId === undefined
    ) {
      continue;
    }
    const latest = known.get(element.id) ?? element;
    for (const write of attachConnector(latest, shape, known).writes) {
      known.set(write.id, write);
      touched.add(write.id);
    }
  }
};

/** Builds each text label from its container as it stands after attaching; returns the label ids. */
const labelAll = (
  placed: Built[],
  known: Map<string, SceneElement>,
  ids: IIdGenerator,
  now: number
): string[] => {
  const created: string[] = [];
  for (const { shape, element } of placed) {
    const latest = known.get(element.id) ?? element;
    if (!(shape.text && hasLabelSlot(latest.type))) {
      continue;
    }
    const label = buildLabel(
      latest,
      shape.text,
      routeStyle(latest.type, pickStyle(shape)).label,
      newIdentity(ids, now)
    );
    known.set(latest.id, withLabel(latest, label.id));
    known.set(label.id, label);
    created.push(label.id);
  }
  return created;
};

/** Fits each frame given without geometry around its children, labels and arrows included. */
const fitFrames = (batch: Built[], known: Map<string, SceneElement>) => {
  for (const { shape, element } of batch) {
    if (shape.type !== "frame" || isPlaced(shape)) {
      continue;
    }
    const children = [...known.values()].filter(
      (e) => e.frameId === element.id && !e.isDeleted
    );
    known.set(element.id, {
      ...element,
      ...wrapFrame(children.map(elementBounds)),
    });
  }
};

export class AddBoardElements {
  constructor(
    private readonly guard: BoardAccessGuard,
    private readonly scenes: IBoardScenes,
    private readonly ids: IIdGenerator
  ) {}

  async execute(input: {
    actor: Actor;
    boardId: string;
    pageId?: string;
    shapes: Shape[];
    direction?: LayoutDirection;
  }): Promise<Result<{ ids: string[] }, AppError>> {
    const granted = await this.guard.require(
      input.boardId,
      input.actor,
      "write"
    );
    if (granted.isErr()) {
      return err(granted.error);
    }
    const now = Date.now();
    const batch = input.shapes.map((shape) => ({
      shape,
      element: buildElement(shape, {
        id: shape.id ?? this.ids.generate(),
        seed: this.ids.int(),
        versionNonce: this.ids.int(),
        updated: now,
      }),
    }));
    const problem = batch.map(shapeProblem).find(Boolean);
    if (problem) {
      return err(FAILURES[problem.outcome](problem.detail));
    }
    const outcome = await this.scenes.transact(
      input.boardId,
      (scene): AddOutcome => {
        const page = resolvePage(
          scene.pages(),
          input.pageId ?? referencedPageId(batch, scene)
        );
        if (!page) {
          return "no-page";
        }
        const existing = scene.all(page.id);
        const known = new Map(existing.map((element) => [element.id, element]));
        const fresh = new Set<string>();
        for (const { element } of batch) {
          // a caller-chosen id must not overwrite an existing element or a sibling
          // SceneAccess.find looks up by id on any page; it is not Array#find
          const taken = scene.find(element.id);
          if (fresh.has(element.id) || taken) {
            return "id-taken";
          }
          fresh.add(element.id);
        }
        for (const { element } of batch) {
          known.set(element.id, element);
        }
        const refProblem = referenceProblem(batch, known);
        if (refProblem) {
          return refProblem;
        }
        // geometry settles first, labels follow: connectors are attached before any label is
        // built, and unsized frames are fitted last, around children whose bounds are final
        const placed = arrange(batch, existing, input.direction);
        for (const { element } of placed) {
          known.set(element.id, element);
        }
        const touched = new Set<string>(fresh);
        attachAll(placed, known, touched);
        for (const id of labelAll(placed, known, this.ids, now)) {
          fresh.add(id);
          touched.add(id);
        }
        fitFrames(batch, known);
        // each element is written exactly once, frames first so their children get keys
        // below them: a second write of a new element at the same version would lose the merge rule
        const isFrame = (id: string) => known.get(id)?.type === "frame";
        const order = [
          ...[...touched].filter(isFrame),
          ...[...touched].filter((id) => !isFrame(id)),
        ];
        for (const id of order) {
          const element = known.get(id);
          if (element) {
            // shapes already in the document need a newer version for browsers to take the binding
            scene.put(
              page.id,
              fresh.has(id) ? element : bumped(element, this.ids)
            );
          }
        }
        return "ok";
      }
    );
    return outcome === "ok"
      ? ok({ ids: batch.map(({ element }) => element.id) })
      : err(FAILURES[outcome]());
  }
}
