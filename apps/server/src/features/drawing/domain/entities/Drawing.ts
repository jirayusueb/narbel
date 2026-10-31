import type { Element } from "./Element";
import type { Page } from "./Page";

/*
 * The Drawing aggregate: one board's pages and elements. The Yjs document is its storage and its
 * sync transport, so the aggregate is not an object here but the invariants every write checks
 * against what it read from the document. The use cases that write call these.
 */

/** The last page cannot be deleted. */
export const pageRemoval = (
  pages: readonly Page[],
  pageId: string
): "missing" | "last" | "removable" => {
  if (!pages.some((page) => page.id === pageId)) {
    return "missing";
  }
  return pages.length === 1 ? "last" : "removable";
};

/**
 * Element ids are unique across pages: an id is taken when any page holds it (`onBoard`) or an
 * earlier element of the same write already uses it.
 */
export const isElementIdTaken = (
  id: string,
  onBoard: (id: string) => unknown,
  sameWrite: ReadonlySet<string> = new Set()
) => sameWrite.has(id) || onBoard(id) !== undefined;

/** A label belongs to exactly one live shape: the id of the text the shape lists as its label. */
export const labelIdOf = (container: Element): string | undefined =>
  container.boundElements?.find((entry) => entry.type === "text")?.id;

/** The shape listing `labelId` as its only label. */
export const withLabel = (container: Element, labelId: string): Element => ({
  ...container,
  boundElements: [
    ...(container.boundElements ?? []).filter((entry) => entry.type !== "text"),
    { id: labelId, type: "text" },
  ],
});

/** A connector end points at a live shape or at nothing: a deleted or unknown target leaves it free. */
export const connectorTarget = (
  id: string | null | undefined,
  targets: Map<string, Element>
): Element | undefined => {
  const target = id === undefined || id === null ? undefined : targets.get(id);
  return target?.isDeleted ? undefined : target;
};
