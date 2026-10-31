import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

export interface Reveal {
  clientId: number;
  pageId: string;
  ids: string[];
}

/**
 * The newest focus request not yet in `seen`, which it updates. Awareness is peer-supplied, so a
 * request counts only from a client registered in the doc's `agents` map; every well-formed reveal
 * number is still marked seen so an agent registered later cannot replay an old one.
 */
export const takeReveal = (
  states: ReadonlyMap<number, Record<string, unknown>>,
  seen: Map<number, number>,
  agents: { has: (clientId: string) => boolean }
): Reveal | undefined => {
  let found: Reveal | undefined;
  for (const [clientId, state] of states) {
    const { reveal: n, pageId, selection } = state;
    if (
      typeof n !== "number" ||
      !Number.isFinite(n) ||
      seen.get(clientId) === n
    ) {
      continue;
    }
    seen.set(clientId, n);
    if (
      agents.has(String(clientId)) &&
      typeof pageId === "string" &&
      Array.isArray(selection) &&
      selection.every((id) => typeof id === "string")
    ) {
      found = { clientId, pageId, ids: selection as string[] };
    }
  }
  return found;
};

/** Fits `ids` in the viewport without zooming past 100%; no-op when none are on the current scene. */
export const reveal = (
  api: ExcalidrawImperativeAPI,
  ids: string[],
  animate: boolean
): void => {
  const wanted = new Set(ids);
  const targets = api.getSceneElements().filter((el) => wanted.has(el.id));
  if (targets.length === 0) {
    return;
  }
  api.scrollToContent(targets, {
    fitToViewport: true,
    viewportZoomFactor: 0.6,
    maxZoom: 1,
    animate,
  });
};
