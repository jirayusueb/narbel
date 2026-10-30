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
import { layered } from "../../domain/rules/layout";
import type { LayoutDirection } from "../../domain/rules/layout";
import {
  LABELLED,
  buildElement,
  buildLabel,
} from "../../domain/shapes/ShapeRegistry";
import type { ElementIdentity, Shape } from "../../domain/shapes/ShapeRegistry";
import type { Actor, BoardAccessGuard } from "../BoardAccess";
import { bumped, newIdentity } from "../connectors";
import type { IBoardScenes } from "../ports/IBoardScenes";

type AddOutcome =
  | "ok"
  | "no-page"
  | "id-taken"
  | "not-connector"
  | "missing-ref"
  | "connector-text"
  | "connector-position";

const FAILURES: Record<Exclude<AddOutcome, "ok">, () => AppError> = {
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
      "text applies to rectangle, ellipse, diamond and text elements, not arrows or lines"
    ),
  "connector-position": () =>
    AppError.validation(
      "an arrow or line needs x and y unless both startElementId and endElementId are set"
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

type ShapeProblem = "connector-text" | "connector-position";

const shapeProblem = ({ shape, element }: Built): ShapeProblem | undefined => {
  if (!connectorCapable(element)) {
    return;
  }
  if (shape.text !== undefined) {
    return "connector-text";
  }
  const bothEnds =
    shape.startElementId !== undefined && shape.endElementId !== undefined;
  return isPlaced(shape) || bothEnds ? undefined : "connector-position";
};

/**
 * Lays out the shapes given without x/y as a flowchart along the batch's arrows,
 * to the right of everything already placed on the page.
 */
const arrange = (
  batch: Built[],
  existing: SceneElement[],
  direction: LayoutDirection = "down"
): Built[] => {
  const loose = batch.filter(
    ({ shape, element }) => !(isPlaced(shape) || connectorCapable(element))
  );
  if (loose.length === 0) {
    return batch;
  }
  const looseIds = new Set(loose.map(({ element }) => element.id));
  const edges = batch.flatMap(({ shape: { startElementId, endElementId } }) =>
    startElementId &&
    endElementId &&
    looseIds.has(startElementId) &&
    looseIds.has(endElementId)
      ? [{ from: startElementId, to: endElementId }]
      : []
  );
  const positions = layered(
    loose.map(({ element }) => ({
      id: element.id,
      width: Number(element.width),
      height: Number(element.height),
    })),
    edges,
    direction
  );
  const fixed = [
    ...existing.filter((e) => !e.isDeleted),
    ...batch.filter(({ shape }) => isPlaced(shape)).map((b) => b.element),
  ];
  const left =
    fixed.length === 0
      ? 0
      : Math.max(...fixed.map((e) => Number(e.x) + Number(e.width))) +
        CLEARANCE;
  const top =
    fixed.length === 0 ? 0 : Math.min(...fixed.map((e) => Number(e.y)));
  return batch.map((built) => {
    const at = positions.get(built.element.id);
    return at
      ? {
          ...built,
          element: { ...built.element, x: left + at.x, y: top + at.y },
        }
      : built;
  });
};

/** The batch's elements, each labelled shape listing its new label, plus those labels. */
const labelled = (placed: Built[], identity: () => ElementIdentity) => {
  const labels: SceneElement[] = [];
  const shapes = placed.map(({ shape, element }) => {
    if (!(shape.text && LABELLED[element.type])) {
      return element;
    }
    const label = buildLabel(element, shape.text, identity());
    labels.push(label);
    return withLabel(element, label.id);
  });
  return { shapes, labels };
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
      return err(FAILURES[problem]());
    }
    const outcome = await this.scenes.transact(
      input.boardId,
      (scene): AddOutcome => {
        const page = resolvePage(scene.pages(), input.pageId);
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
        }
        const placed = arrange(batch, existing, input.direction);
        // labels go in once their shapes have their final position and size
        const { shapes, labels } = labelled(placed, () =>
          newIdentity(this.ids, now)
        );
        for (const element of [...shapes, ...labels]) {
          known.set(element.id, element);
          fresh.add(element.id);
        }
        // settle every binding in memory first, then write each element exactly once:
        // a second write of a new element at the same version would lose the merge rule
        const touched = new Set<string>(fresh);
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
        for (const id of touched) {
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
