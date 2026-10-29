// The "elements" map is board-wide; every key is `<pageId>:<elementId>`.
export const elementKey = (pageId: string, elementId: string) =>
  `${pageId}:${elementId}`;

export const isOnPage = (pageId: string, key: string) =>
  key.startsWith(`${pageId}:`);
