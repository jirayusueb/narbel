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
