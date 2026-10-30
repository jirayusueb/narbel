import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";

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
