import type { IIdGenerator } from "../../../../shared/application/interfaces/IIdGenerator";
import { AppError } from "../../../../shared/kernel/errors/AppError";
import type { Actor } from "../../../../shared/kernel/types/Actor";
import { err, ok } from "../../../../shared/kernel/types/Result";
import type { Result } from "../../../../shared/kernel/types/Result";
import { Drawing } from "../../domain/entities/Drawing";
import type { Element } from "../../domain/entities/Element";
import { resolvePage } from "../../domain/entities/Page";
import { Bindings } from "../../domain/rules/bindings";
import { Geometry } from "../../domain/rules/geometry";
import type { Bounds } from "../../domain/rules/geometry";
import { Layout } from "../../domain/rules/layout";
import type { LayoutDirection } from "../../domain/rules/layout";
import { ElementStyle } from "../../domain/shapes/ElementStyle";
import { ShapeRegistry } from "../../domain/shapes/ShapeRegistry";
import type { Shape, ShapeInput } from "../../domain/shapes/ShapeRegistry";
import { bumped, newIdentity } from "../connectors";
import type { IBoardAccess } from "../ports/IBoardAccess";
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

interface Built {
  shape: Shape;
  /** the agent gave startElementId/endElementId to a shape that cannot connect */
  strayEnds: boolean;
  element: Element;
}

const isPlaced = (shape: Shape) =>
  shape.x !== undefined && shape.y !== undefined;

const live = (e: Element) => !e.isDeleted;

const arrange = (
  batch: Built[],
  existing: Element[],
  direction: LayoutDirection = "down"
): Built[] => {
  const loose = batch.filter(
    ({ shape, element }) =>
      !(
        isPlaced(shape) ||
        Bindings.connectorCapable(element) ||
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
  ].map(Geometry.elementBounds);
  const groups = new Map<string | undefined, Built[]>();
  for (const built of loose) {
    groups.set(ShapeRegistry.frameIdOf(built.shape), [
      ...(groups.get(ShapeRegistry.frameIdOf(built.shape)) ?? []),
      built,
    ]);
  }
  const at = new Map<string, { x: number; y: number }>();
  for (const [frameId, members] of groups) {
    const ids = new Set(members.map(({ element }) => element.id));
    const edges = batch.flatMap(({ shape }) => {
      const { startElementId, endElementId } = ShapeRegistry.endsOf(shape);
      return startElementId &&
        endElementId &&
        ids.has(startElementId) &&
        ids.has(endElementId)
        ? [
            {
              from: startElementId,
              to: endElementId,
              label:
                shape.type === "arrow" && shape.text
                  ? ShapeRegistry.arrowLabelSize(
                      shape.text,
                      shape.fontSize ?? ElementStyle.STYLE.fontSize.default
                    )
                  : undefined,
            },
          ]
        : [];
    });
    const positions = Layout.layered(
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
    const pad = frameId === undefined ? 0 : Layout.FRAME_PADDING;
    const start = inside
      ? { left: Number(frame.x) + pad, top: Number(frame.y) + pad }
      : (() => {
          const beside = Layout.besideContent(fixed, Layout.CLEARANCE);
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
      fixed.push(pad === 0 ? Geometry.union(placed) : Layout.wrapFrame(placed));
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
    .flatMap(({ shape }) => [
      ShapeRegistry.endsOf(shape).startElementId,
      ShapeRegistry.endsOf(shape).endElementId,
      ShapeRegistry.frameIdOf(shape),
    ])
    .map((ref) => (ref === undefined ? undefined : scene.locate(ref)?.pageId))
    .find((pageId) => pageId !== undefined);

const referenceProblem = (
  batch: Built[],
  known: Map<string, Element>
): Exclude<AddOutcome, "ok"> | undefined => {
  for (const { shape, strayEnds } of batch) {
    if (strayEnds) {
      return "not-connector";
    }
    const { startElementId, endElementId } = ShapeRegistry.endsOf(shape);
    if (
      [startElementId, endElementId].some(
        (ref) => ref !== undefined && !known.has(ref)
      )
    ) {
      return "missing-ref";
    }
    const frameId = ShapeRegistry.frameIdOf(shape);
    if (frameId !== undefined) {
      const frame = known.get(frameId);
      if (frame?.type !== "frame" || frame.isDeleted) {
        return "missing-frame";
      }
    }
  }
  const hasChildren = ({ element }: Built) =>
    batch.some(({ shape }) => ShapeRegistry.frameIdOf(shape) === element.id);
  return batch.some(
    (built) =>
      built.shape.type === "frame" &&
      !isPlaced(built.shape) &&
      !hasChildren(built)
  )
    ? "frame-empty"
    : undefined;
};

const attachAll = (
  placed: Built[],
  known: Map<string, Element>,
  touched: Set<string>
) => {
  for (const { shape, element } of placed) {
    const ends = ShapeRegistry.endsOf(shape);
    if (ends.startElementId === undefined && ends.endElementId === undefined) {
      continue;
    }
    const latest = known.get(element.id) ?? element;
    for (const write of Bindings.attachConnector(latest, ends, known).writes) {
      known.set(write.id, write);
      touched.add(write.id);
    }
  }
};

const labelAll = (
  placed: Built[],
  known: Map<string, Element>,
  ids: IIdGenerator,
  now: number
): string[] => {
  const created: string[] = [];
  for (const { shape, element } of placed) {
    const latest = known.get(element.id) ?? element;
    const text = ShapeRegistry.textOf(shape);
    if (!(text && ElementStyle.hasLabelSlot(latest.type))) {
      continue;
    }
    const label = ShapeRegistry.buildLabel(
      latest,
      text,
      ElementStyle.routeStyle(latest.type, ElementStyle.pickStyle(shape)).label,
      newIdentity(ids, now)
    );
    known.set(latest.id, Drawing.withLabel(latest, label.id));
    known.set(label.id, label);
    created.push(label.id);
  }
  return created;
};

const fitFrames = (
  batch: Built[],
  known: Map<string, Element>,
  touched: Set<string>
) => {
  const fitted = batch.filter(
    ({ shape }) => shape.type === "frame" && !isPlaced(shape)
  );
  for (const { element } of fitted) {
    const children = [...known.values()].filter(
      (e) => e.frameId === element.id && !e.isDeleted
    );
    known.set(element.id, {
      ...(known.get(element.id) ?? element),
      ...Layout.wrapFrame(children.map(Geometry.elementBounds)),
    });
  }
  for (const { element } of fitted) {
    for (const arrow of Bindings.rerouteAround(
      known.get(element.id) ?? element,
      known
    )) {
      known.set(arrow.id, arrow);
      touched.add(arrow.id);
      const label = known.get(Drawing.labelIdOf(arrow) ?? "");
      if (label) {
        known.set(label.id, ShapeRegistry.fitLabel(label, arrow));
      }
    }
  }
};

/** A placed child outside its sized frame would be clipped away in the browser, so it stays unframed. */
const unframeStrays = (placed: Built[], known: Map<string, Element>) => {
  const unsized = new Set(
    placed
      .filter(({ shape }) => shape.type === "frame" && !isPlaced(shape))
      .map(({ element }) => element.id)
  );
  return placed.map((built) => {
    const { shape, element } = built;
    const frameId = ShapeRegistry.frameIdOf(shape);
    const frame = frameId === undefined ? undefined : known.get(frameId);
    const stray =
      isPlaced(shape) &&
      frame !== undefined &&
      !unsized.has(frame.id) &&
      !Geometry.overlaps(
        Geometry.elementBounds(element),
        Geometry.elementBounds(frame)
      );
    return stray ? { ...built, element: { ...element, frameId: null } } : built;
  });
};

export class AddBoardElements {
  constructor(
    private readonly policy: IBoardAccess,
    private readonly scenes: IBoardScenes,
    private readonly ids: IIdGenerator
  ) {}

  async execute(input: {
    actor: Actor;
    boardId: string;
    pageId?: string;
    shapes: ShapeInput[];
    direction?: LayoutDirection;
  }): Promise<Result<{ ids: string[] }, AppError>> {
    const granted = await this.policy.decide(
      input.boardId,
      input.actor,
      "write"
    );
    if (granted.isErr()) {
      return err(granted.error);
    }
    const now = Date.now();
    const shapes: Shape[] = [];
    const strayEnds = input.shapes.map(
      (flat) =>
        (flat.startElementId !== undefined ||
          flat.endElementId !== undefined) &&
        flat.type !== "arrow" &&
        flat.type !== "line"
    );
    for (const flat of input.shapes) {
      const parsed = ShapeRegistry.parseShape(flat);
      if (parsed.isErr()) {
        return err(FAILURES[parsed.error.outcome](parsed.error.detail));
      }
      shapes.push(parsed.value);
    }
    const batch = shapes.map((shape, i) => ({
      shape,
      strayEnds: strayEnds[i] ?? false,
      element: ShapeRegistry.buildElement(shape, {
        id: shape.id ?? this.ids.generate(),
        seed: this.ids.int(),
        versionNonce: this.ids.int(),
        updated: now,
      }),
    }));
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
          if (
            Drawing.isElementIdTaken(
              element.id,
              (id) => scene.locate(id),
              fresh
            )
          ) {
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
        const placed = unframeStrays(
          arrange(batch, existing, input.direction),
          known
        );
        for (const { element } of placed) {
          known.set(element.id, element);
        }
        const touched = new Set<string>(fresh);
        attachAll(placed, known, touched);
        for (const id of labelAll(placed, known, this.ids, now)) {
          fresh.add(id);
          touched.add(id);
        }
        fitFrames(batch, known, touched);
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
