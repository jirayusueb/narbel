import { AppError } from "../../../../shared/kernel/errors/app-error";
import type { Flavor } from "../../../../shared/kernel/types/flavor";
import { err, ok } from "../../../../shared/kernel/types/result";
import type { Result } from "../../../../shared/kernel/types/result";
import type { ElementId } from "./element";

export type PageId = Flavor<string, "PageId">;

export const PAGE_NAME_MAX_LENGTH = 80;

export class Page {
  private constructor(
    readonly id: PageId,
    readonly name: string
  ) {}

  static create(id: PageId, name: string): Page {
    return new Page(id, name);
  }

  static parseName(raw: string): Result<string, AppError> {
    const name = raw.trim();
    return name.length < 1 || name.length > PAGE_NAME_MAX_LENGTH
      ? err(
          AppError.validation(
            `Page name must be 1 to ${PAGE_NAME_MAX_LENGTH} characters`
          )
        )
      : ok(name);
  }

  /** Elements of every page share one map, so the key carries the page. */
  static keyOf(pageId: PageId, elementId: ElementId) {
    return `${pageId}:${elementId}`;
  }

  static resolve(pages: Page[], pageId: PageId | undefined) {
    return pageId === undefined
      ? pages[0]
      : pages.find((page) => page.id === pageId);
  }
}

export const MAIN_PAGE = Page.create("page:main", "Page 1");
