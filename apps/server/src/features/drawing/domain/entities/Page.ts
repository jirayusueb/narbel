export interface Page {
  id: string;
  name: string;
}

export const MAIN_PAGE: Page = { id: "page:main", name: "Page 1" };
export const PAGE_NAME_MAX_LENGTH = 80;

/** Elements of every page share one map, so the key carries the page. */
export const elementKey = (pageId: string, elementId: string) =>
  `${pageId}:${elementId}`;

export const resolvePage = (pages: Page[], pageId: string | undefined) =>
  pageId === undefined ? pages[0] : pages.find((page) => page.id === pageId);
