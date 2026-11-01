import { AppError } from "../../../../shared/kernel/errors/app-error";
import { err, ok } from "../../../../shared/kernel/types/result";
import type { Result } from "../../../../shared/kernel/types/result";

export const PAGE_NAME_MAX_LENGTH = 80;

export class Page {
  private constructor(
    readonly id: string,
    readonly name: string
  ) {}

  static create(id: string, name: string): Page {
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
  static keyOf(pageId: string, elementId: string) {
    return `${pageId}:${elementId}`;
  }

  static resolve(pages: Page[], pageId: string | undefined) {
    return pageId === undefined
      ? pages[0]
      : pages.find((page) => page.id === pageId);
  }
}

export const MAIN_PAGE = Page.create("page:main", "Page 1");
