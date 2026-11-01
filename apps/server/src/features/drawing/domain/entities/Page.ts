export class Page {
  private constructor(
    readonly id: string,
    readonly name: string
  ) {}

  static create(id: string, name: string): Page {
    return new Page(id, name);
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
export const PAGE_NAME_MAX_LENGTH = 80;
