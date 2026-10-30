import type { IIdGenerator } from "../../../../shared/application/interfaces/IIdGenerator";
import { AppError } from "../../../../shared/kernel/errors/AppError";
import { err, ok } from "../../../../shared/kernel/types/Result";
import type { Result } from "../../../../shared/kernel/types/Result";
import { resolvePage } from "../../domain/entities/Page";
import { attachConnector, connectorCapable } from "../../domain/rules/bindings";
import { buildElement } from "../../domain/shapes/ShapeRegistry";
import type { Shape } from "../../domain/shapes/ShapeRegistry";
import type { Actor, BoardAccessGuard } from "../BoardAccess";
import { bumped } from "../connectors";
import type { IBoardScenes } from "../ports/IBoardScenes";

type AddOutcome =
  | "ok"
  | "no-page"
  | "id-taken"
  | "not-connector"
  | "missing-ref";

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
    const outcome = await this.scenes.transact(
      input.boardId,
      (scene): AddOutcome => {
        const page = resolvePage(scene.pages(), input.pageId);
        if (!page) {
          return "no-page";
        }
        const known = new Map(
          scene.all(page.id).map((element) => [element.id, element])
        );
        const fresh = new Set<string>();
        for (const { element } of batch) {
          // a caller-chosen id must not overwrite an existing element or a sibling
          // SceneAccess.find looks up by id on any page; it is not Array#find
          const existing = scene.find(element.id);
          if (fresh.has(element.id) || existing) {
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
        // settle every binding in memory first, then write each element exactly once:
        // a second write of a new element at the same version would lose the merge rule
        const touched = new Set<string>(fresh);
        for (const { shape, element } of batch) {
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
