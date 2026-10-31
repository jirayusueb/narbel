import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";

import { elementIdOf, isOnPage } from "@/entities/drawing";

type Versioned = Pick<ExcalidrawElement, "version" | "versionNonce">;

// Excalidraw's own reconciliation rule.
export const shouldTakeIncoming = (
  local: Versioned | undefined,
  incoming: Versioned
) =>
  !local ||
  incoming.version > local.version ||
  (incoming.version === local.version &&
    incoming.versionNonce < local.versionNonce);

export const incomingFor = (
  pageId: string,
  keys: Iterable<string>,
  get: (key: string) => ExcalidrawElement | undefined,
  local: ReadonlyMap<string, ExcalidrawElement>,
  // a version restore is authoritative: its versions may sit below a local tombstone the server has pruned
  isRestore = false
) => {
  const incoming: ExcalidrawElement[] = [];
  for (const key of keys) {
    if (!isOnPage(pageId, key)) {
      continue;
    }
    const remote = get(key);
    if (remote) {
      if (isRestore || shouldTakeIncoming(local.get(remote.id), remote)) {
        incoming.push({ ...remote });
      }
      continue;
    }
    const shown = local.get(elementIdOf(pageId, key));
    if (shown && !shown.isDeleted) {
      incoming.push({ ...shown, isDeleted: true });
    }
  }
  return incoming;
};

/**
 * Canvas elements that beat the shared document's value for a key that just changed. Yjs picks between
 * concurrent writes of one key by client id, not by Excalidraw version, so after a merge the document can
 * hold the loser while this canvas shows the winner; writing the winner back makes every peer agree.
 */
export const outranking = (
  pageId: string,
  keys: Iterable<string>,
  get: (key: string) => ExcalidrawElement | undefined,
  local: ReadonlyMap<string, ExcalidrawElement>,
  canWrite: boolean
) => {
  const winners: { key: string; element: ExcalidrawElement }[] = [];
  if (!canWrite) {
    return winners;
  }
  for (const key of keys) {
    const remote = isOnPage(pageId, key) ? get(key) : undefined;
    const shown = remote && local.get(remote.id);
    if (remote && shown && shouldTakeIncoming(remote, shown)) {
      winners.push({ key, element: shown });
    }
  }
  return winners;
};

type Indexed = Pick<ExcalidrawElement, "id"> & { index?: string | null };

/**
 * Excalidraw's z-order: ascending fractional `index`, ties by id, unindexed last. The shared
 * map iterates in CRDT order, and Excalidraw rewrites (and re-versions) any index that is out
 * of order in the array it is given, so the scene must be sorted before it is handed over.
 */
export const byZOrder = (a: Indexed, b: Indexed) => {
  const ai = a.index ?? undefined;
  const bi = b.index ?? undefined;
  if (ai === bi) {
    return a.id < b.id ? -1 : 1;
  }
  if (ai === undefined || bi === undefined) {
    return ai === undefined ? 1 : -1;
  }
  return ai < bi ? -1 : 1;
};
