import type { IIdGenerator } from "../../../../shared/application/interfaces/i-id-generator";
import { AppError } from "../../../../shared/kernel/errors/app-error";
import type { Actor } from "../../../../shared/kernel/types/actor";
import type { BoardId } from "../../../../shared/kernel/types/ids";
import { err, ok } from "../../../../shared/kernel/types/result";
import type { Result } from "../../../../shared/kernel/types/result";
import { Drawing } from "../../domain/entities/drawing";
import type { ElementId } from "../../domain/entities/element";
import { Groups } from "../../domain/rules/groups";
import { bumped } from "../connectors";
import { resolveOperands } from "../operands";
import type { IBoardAccess } from "../ports/i-board-access";
import type { IBoardScenes } from "../ports/i-board-scenes";

export class GroupElements {
  constructor(
    private readonly policy: IBoardAccess,
    private readonly scenes: IBoardScenes,
    private readonly ids: IIdGenerator
  ) {}

  async group(input: {
    actor: Actor;
    boardId: BoardId;
    ids: ElementId[];
  }): Promise<
    Result<{ groupId: string; ids: ElementId[]; locked?: string[] }, AppError>
  > {
    const granted = await this.policy.decide(
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
      const { pageId, elements } = operands.value;
      const given = elements.filter((e) => e.locked !== true);
      if (given.length < 2) {
        return err(
          AppError.validation("Grouping needs at least two unlocked elements")
        );
      }
      const page = scene.all(pageId);
      const expanded = Groups.withGroupMates(given, page);
      const members = expanded.filter((e) => e.locked !== true);
      const locked = [
        ...elements.filter((e) => e.locked === true),
        ...expanded.filter((e) => e.locked === true),
      ].map((e) => e.id);
      const memberIds = members.map((m) => m.id);
      const existing = Groups.existingGroup(members, page);
      const groupId = existing ?? this.ids.generate();
      if (!existing) {
        for (const member of members) {
          const labelId = Drawing.labelIdOf(member);
          const label = labelId ? scene.get(pageId, labelId) : undefined;
          for (const e of [
            member,
            ...(label && !label.isDeleted ? [label] : []),
          ]) {
            scene.put(pageId, bumped(Groups.withGroup(e, groupId), this.ids));
          }
        }
      }
      return ok({
        groupId,
        ids: memberIds,
        ...(locked.length > 0 ? { locked } : {}),
      });
    });
  }

  async ungroup(input: {
    actor: Actor;
    boardId: BoardId;
    ids: ElementId[];
  }): Promise<Result<{ groupIds: string[] }, AppError>> {
    const granted = await this.policy.decide(
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
      const { pageId, elements } = operands.value;
      const groupIds = Groups.outermostGroups(elements);
      for (const element of scene.all(pageId)) {
        for (const groupId of groupIds) {
          if (
            !element.isDeleted &&
            element.groupIds?.includes(groupId) === true
          ) {
            scene.put(
              pageId,
              bumped(
                Groups.withoutGroup(
                  scene.get(pageId, element.id) ?? element,
                  groupId
                ),
                this.ids
              )
            );
          }
        }
      }
      return ok({ groupIds });
    });
  }
}
