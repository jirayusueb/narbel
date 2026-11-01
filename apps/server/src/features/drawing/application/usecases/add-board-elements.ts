import type { IIdGenerator } from "../../../../shared/application/interfaces/i-id-generator";
import { AppError } from "../../../../shared/kernel/errors/app-error";
import type { Actor } from "../../../../shared/kernel/types/actor";
import { err, ok } from "../../../../shared/kernel/types/result";
import type { Result } from "../../../../shared/kernel/types/result";
import { Drawing } from "../../domain/entities/drawing";
import type { Element } from "../../domain/entities/element";
import { Page } from "../../domain/entities/page";
import type { LayoutDirection } from "../../domain/rules/layout";
import { Placement } from "../../domain/rules/placement";
import type { Built } from "../../domain/rules/placement";
import { ElementStyle } from "../../domain/shapes/element-style";
import { ShapeRegistry } from "../../domain/shapes/shape-registry";
import type { Shape, ShapeInput } from "../../domain/shapes/shape-registry";
import { bumped, newIdentity } from "../connectors";
import type { IBoardAccess } from "../ports/i-board-access";
import type { IBoardScenes, SceneAccess } from "../ports/i-board-scenes";

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
        const page = Page.resolve(
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
        const refProblem = Placement.referenceProblem(batch, known);
        if (refProblem) {
          return refProblem;
        }
        const placed = Placement.unframeStrays(
          Placement.arrange(batch, existing, input.direction),
          known
        );
        for (const { element } of placed) {
          known.set(element.id, element);
        }
        const touched = new Set<string>(fresh);
        Placement.attachAll(placed, known, touched);
        for (const id of labelAll(placed, known, this.ids, now)) {
          fresh.add(id);
          touched.add(id);
        }
        Placement.fitFrames(batch, known, touched);
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
