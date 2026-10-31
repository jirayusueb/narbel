import type { IIdGenerator } from "../../../../shared/application/interfaces/IIdGenerator";
import type { AppError } from "../../../../shared/kernel/errors/AppError";
import type { Actor } from "../../../../shared/kernel/types/Actor";
import { err, ok } from "../../../../shared/kernel/types/Result";
import type { Result } from "../../../../shared/kernel/types/Result";
import { arrangeMoves, unitItem, unitsOf } from "../../domain/rules/arrange";
import type { Arrangement } from "../../domain/rules/arrange";
import { connectorCapable } from "../../domain/rules/bindings";
import { num } from "../../domain/rules/geometry";
import { withGroupMates } from "../../domain/rules/groups";
import type { BoardAccessGuard } from "../BoardAccess";
import { pageLookup, patchElement } from "../connectors";
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
      const mates = withGroupMates(
        operands.value.elements,
        scene.all(operands.value.pageId)
      );
      // a frame carries its children, so a child among the movers (named or via a group) must not move twice
      const moving = new Set(mates.map((e) => e.id));
      const members = mates
        .filter(
          (e) => !(typeof e.frameId === "string" && moving.has(e.frameId))
        )
        .filter((e) => {
          const bound =
            connectorCapable(e) && Boolean(e.startBinding ?? e.endBinding);
          if (bound) {
            skipped.push({ id: e.id, reason: "connector" });
          }
          return !bound;
        });
      const units = unitsOf(members).filter((unit) => {
        const locked = unit.members.some((e) => e.locked === true);
        if (locked) {
          skipped.push(
            ...unit.members.map((e) => ({
              id: e.id,
              reason: "locked" as const,
            }))
          );
        }
        return !locked;
      });
      const byKey = new Map(units.map((u) => [u.key, u]));
      const lookup = pageLookup(scene, operands.value.pageId);
      const moved: string[] = [];
      for (const { id, dx, dy } of arrangeMoves(
        units.map(unitItem),
        input.how
      )) {
        for (const e of byKey.get(id)?.members ?? []) {
          const fields = { x: num(e.x) + dx, y: num(e.y) + dy };
          if (
            patchElement(scene, this.ids, e.id, fields, {}, false, lookup) ===
            "ok"
          ) {
            moved.push(e.id);
          }
        }
      }
      return ok({ moved, skipped });
    });
  }
}
