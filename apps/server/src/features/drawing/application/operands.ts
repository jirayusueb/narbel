import { AppError } from "../../../shared/kernel/errors/app-error";
import { err, ok } from "../../../shared/kernel/types/result";
import type { Result } from "../../../shared/kernel/types/result";
import type { Element, ElementId } from "../domain/entities/element";
import type { PageId } from "../domain/entities/page";
import type { SceneAccess } from "./ports/i-board-scenes";

export interface Operands {
  pageId: PageId;
  elements: Element[];
}

export const resolveOperands = (
  scene: SceneAccess,
  ids: ElementId[]
): Result<Operands, AppError> => {
  const missing: string[] = [];
  const byId = new Map<ElementId, { pageId: PageId; element: Element }>();
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
