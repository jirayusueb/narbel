export interface Versioned {
  version: number;
  versionNonce: number;
}

// Excalidraw's reconcile rule: higher version wins, equal versions break the tie on the lower nonce.
export function shouldAcceptIncoming(
  local: Versioned | undefined,
  incoming: Versioned
): boolean {
  if (!local) {
    return true;
  }
  return (
    incoming.version > local.version ||
    (incoming.version === local.version &&
      incoming.versionNonce < local.versionNonce)
  );
}
