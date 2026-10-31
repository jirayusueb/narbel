import type { IIdGenerator } from "../../../../shared/application/interfaces/IIdGenerator";
import { AppError } from "../../../../shared/kernel/errors/AppError";
import type { Actor } from "../../../../shared/kernel/types/Actor";
import { err, ok } from "../../../../shared/kernel/types/Result";
import type { Result } from "../../../../shared/kernel/types/Result";
import type { Element } from "../../domain/entities/Element";
import { labelIdOf } from "../../domain/rules/bindings";
import {
  existingGroup,
  outermostGroups,
  withGroup,
  withGroupMates,
  withoutGroup,
} from "../../domain/rules/groups";
import type { BoardAccessGuard } from "../BoardAccess";
import { bumped } from "../connectors";
import type { IBoardScenes, SceneAccess } from "../ports/IBoardScenes";

export interface Operands {
  pageId: string;
  elements: Element[];
}

export const resolveOperands = (
  scene: SceneAccess,
  ids: string[]
): Result<Operands, AppError> => {
  const missing: string[] = [];
  const byId = new Map<string, { pageId: string; element: Element }>();
  for (const id of ids) {
    const found = scene.locate(id);
    const host =
      found && typeof found.element.containerId === "string"
        ? scene.locate(found.element.containerId)
        : found;
    if (!host || host.element.isDeleted || found?.element.isDeleted) {
      missing.push(id);
    } else {
      byId.set(host.element.id, host);
    }
  }
  if (missing.length > 0) {
    return err(AppError.notFound(`Elements ${missing.join(", ")}`));
  }
  const hosts = [...byId.values()];
  const [first] = hosts;
  if (!first || hosts.some((h) => h.pageId !== first.pageId)) {
    return err(AppError.validation("Elements must all be on the same page"));
  }
  return ok({
    pageId: first.pageId,
    elements: hosts.map((h) => h.element),
  });
};

export class GroupElements {
  constructor(
    private readonly guard: BoardAccessGuard,
    private readonly scenes: IBoardScenes,
    private readonly ids: IIdGenerator
  ) {}

  async group(input: {
    actor: Actor;
    boardId: string;
    ids: string[];
  }): Promise<
    Result<{ groupId: string; ids: string[]; locked?: string[] }, AppError>
  > {
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
      const { pageId, elements } = operands.value;
      const given = elements.filter((e) => e.locked !== true);
      if (given.length < 2) {
        return err(
          AppError.validation("Grouping needs at least two unlocked elements")
        );
      }
      const page = scene.all(pageId);
      const expanded = withGroupMates(given, page);
      const members = expanded.filter((e) => e.locked !== true);
      const locked = [
        ...elements.filter((e) => e.locked === true),
        ...expanded.filter((e) => e.locked === true),
      ].map((e) => e.id);
      const memberIds = members.map((m) => m.id);
      const existing = existingGroup(members, page);
      const groupId = existing ?? this.ids.generate();
      if (!existing) {
        for (const member of members) {
          const labelId = labelIdOf(member);
          const label = labelId ? scene.get(pageId, labelId) : undefined;
          for (const e of [
            member,
            ...(label && !label.isDeleted ? [label] : []),
          ]) {
            scene.put(pageId, bumped(withGroup(e, groupId), this.ids));
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
    boardId: string;
    ids: string[];
  }): Promise<Result<{ groupIds: string[] }, AppError>> {
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
      const { pageId, elements } = operands.value;
      const groupIds = outermostGroups(elements);
      for (const element of scene.all(pageId)) {
        for (const groupId of groupIds) {
          if (
            !element.isDeleted &&
            element.groupIds?.includes(groupId) === true
          ) {
            scene.put(
              pageId,
              bumped(
                withoutGroup(scene.get(pageId, element.id) ?? element, groupId),
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
