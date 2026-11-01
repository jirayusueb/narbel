export interface Versioned {
  version: number;
  versionNonce: number;
}

export class MergeElement {
  private constructor() {
    // static rules only
  }

  // Excalidraw's reconcile rule: higher version wins, equal versions break the tie on the lower nonce.
  static shouldAcceptIncoming(
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
}
