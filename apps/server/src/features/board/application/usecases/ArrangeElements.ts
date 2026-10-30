import type { IIdGenerator } from "../../../../shared/application/interfaces/IIdGenerator";
import type { AppError } from "../../../../shared/kernel/errors/AppError";
import { err, ok } from "../../../../shared/kernel/types/Result";
import type { Result } from "../../../../shared/kernel/types/Result";
import { arrangeMoves } from "../../domain/rules/arrange";
import type { Arrangement } from "../../domain/rules/arrange";
import { connectorCapable } from "../../domain/rules/bindings";
import { elementBounds, num } from "../../domain/rules/geometry";
import type { Actor, BoardAccessGuard } from "../BoardAccess";
import { patchElement } from "../connectors";
import type { IBoardScenes } from "../ports/IBoardScenes";
import { resolveOperands } from "./GroupElements";

export interface ArrangeResult {
  moved: string[];
  skipped: { id: string; reason: "locked" | "connector" }[];
}

export class ArrangeElements {
  constructor(
    private readonly guard: BoardAccessGuard,
    private readonly scenes: IBoardScenes,
    private readonly ids: IIdGenerator
  ) {}

  async execute(input: {
    actor: Actor;
    boardId: string;
    ids: string[];
    how: Arrangement;
  }): Promise<Result<ArrangeResult, AppError>> {
    const granted = await this.guard.require(
      input.boardId,
      input.actor,
      "write"
    );
    if (granted.isErr()) {
      return err(granted.error);
    }
    return this.scenes.transact(input.boardId, (scene) => {
      const operands = resolveOperands(scene, input.ids);
      if (operands.isErr()) {
        return err(operands.error);
      }
      const skipped: ArrangeResult["skipped"] = [];
      const movable = operands.value.elements.filter((e) => {
        // connectors follow the shapes they are bound to; a free arrow can still move
        const bound =
          connectorCapable(e) && Boolean(e.startBinding ?? e.endBinding);
        const reason = e.locked === true ? "locked" : bound && "connector";
        if (reason) {
          skipped.push({ id: e.id, reason });
        }
        return !reason;
      });
      const moves = arrangeMoves(
        movable.map((e) => ({ id: e.id, bounds: elementBounds(e) })),
        input.how
      );
      const byId = new Map(movable.map((e) => [e.id, e]));
      const moved: string[] = [];
      for (const { id, dx, dy } of moves) {
        const e = byId.get(id);
        // shortcut: a group's members align one by one, not as a unit; upgrade when agents need rigid groups
        // shortcut: patchElement rebuilds its page lookup per call, O(moves x page); upgrade if boards get huge
        if (
          e &&
          patchElement(scene, this.ids, id, {
            x: num(e.x) + dx,
            y: num(e.y) + dy,
          }) === "ok"
        ) {
          moved.push(id);
        }
      }
      return ok({ moved, skipped });
    });
  }
}
