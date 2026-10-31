import type { Element } from "../../domain/entities/Element";
import { labelIdOf } from "../../domain/rules/bindings";
import type { ElementTouch, SceneAccess } from "../ports/IBoardScenes";
import type { ChangedComment } from "../ports/ICommentActivity";
import { byZOrder, toSceneElementDto } from "./SceneDto";
import type { SceneElementDto } from "./SceneDto";

export interface DeletedElementDto {
  id: string;
  type: string;
  /** text, or a shape's label, as last seen */
  text?: unknown;
}

export interface PageChangesDto {
  pageId: string;
  name: string;
  added: SceneElementDto[];
  updated: SceneElementDto[];
  deleted: DeletedElementDto[];
}

export interface BoardChangesDto {
  /** pass back as `since` */
  cursor: string;
  /** pages with at least one change, in page order */
  pages: PageChangesDto[];
  /** element changes left out past the cap; get_board has them */
  omitted: number;
  /** threads and replies created, edited or resolved since the cursor, oldest first */
  comments: ChangedComment[];
  /** more comment activity waits; call again with `cursor` */
  moreComments: boolean;
}

type Kind = "added" | "updated" | "deleted";

interface Entry {
  pageIndex: number;
  element: Element;
  kind: Kind;
}

const kindOf = (element: Element, existed: boolean): Kind | undefined => {
  if (existed) {
    return element.isDeleted ? "deleted" : "updated";
  }
  return element.isDeleted ? undefined : "added";
};

/**
 * Classifies touches and folds labels into their shapes.
 * existed & live → updated; existed & deleted → deleted; new & live → added; new & deleted → dropped.
 * A touched label reports its container once (as updated unless the container is itself added/deleted).
 * Keeps the first `max` entries in page order, then z-order; counts the rest in `omitted`.
 */
export const toPageChanges = (
  touches: ElementTouch[],
  scene: Pick<SceneAccess, "get" | "pages">,
  max: number
): { pages: PageChangesDto[]; omitted: number } => {
  const pages = scene.pages();
  const entries: Entry[] = [];
  for (const [pageIndex, page] of pages.entries()) {
    const own = touches.filter((t) => t.pageId === page.id);
    const byId = new Map(own.map((t) => [t.element.id, t]));
    const containers = new Map<string, Entry>();
    for (const touch of own) {
      const { element } = touch;
      const container =
        typeof element.containerId === "string"
          ? scene.get(page.id, element.containerId)
          : undefined;
      if (container) {
        const touched = byId.get(container.id);
        let kind: Kind | undefined = "updated";
        if (touched) {
          kind = kindOf(container, touched.existedAtCursor);
        } else if (container.isDeleted) {
          kind = undefined;
        }
        if (kind) {
          containers.set(container.id, { pageIndex, element: container, kind });
        }
      } else {
        const kind = kindOf(element, touch.existedAtCursor);
        if (kind) {
          containers.set(element.id, { pageIndex, element, kind });
        }
      }
    }
    entries.push(...containers.values());
  }
  entries.sort(
    (a, b) => a.pageIndex - b.pageIndex || byZOrder(a.element, b.element)
  );

  const kept = entries.slice(0, max);
  const result: PageChangesDto[] = [];
  for (const { pageIndex, element, kind } of kept) {
    const page = pages[pageIndex];
    if (!page) {
      continue;
    }
    let dto = result.at(-1);
    if (dto?.pageId !== page.id) {
      dto = {
        pageId: page.id,
        name: page.name,
        added: [],
        updated: [],
        deleted: [],
      };
      result.push(dto);
    }
    const labelOf = (e: Element) => {
      const labelId = labelIdOf(e);
      return labelId === undefined ? undefined : scene.get(page.id, labelId);
    };
    if (kind === "deleted") {
      const text =
        element.type === "text" ? element.text : labelOf(element)?.text;
      dto.deleted.push({
        id: element.id,
        type: element.type,
        ...(text === undefined ? {} : { text }),
      });
    } else {
      dto[kind].push(
        toSceneElementDto(element, (label) => scene.get(page.id, label))
      );
    }
  }
  return { pages: result, omitted: entries.length - kept.length };
};
