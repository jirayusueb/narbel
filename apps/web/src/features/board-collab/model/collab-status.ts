export type CollabStatus =
  | "connecting"
  | "syncing"
  | "live"
  | "offline"
  | "no-access";

export interface ConnectionFacts {
  wsconnected: boolean;
  synced: boolean;
  // y-websocket counts every closed attempt and resets it once a connection synced.
  wsUnsuccessfulReconnects: number;
  noAccess: boolean;
}

export const deriveCollabStatus = ({
  wsconnected,
  synced,
  wsUnsuccessfulReconnects,
  noAccess,
}: ConnectionFacts): CollabStatus => {
  if (noAccess) {
    return "no-access";
  }
  if (wsconnected) {
    return synced ? "live" : "syncing";
  }
  return wsUnsuccessfulReconnects > 0 ? "offline" : "connecting";
};

// Close code the server sends when the session is refused after the upgrade (BoardSyncController).
export const WS_POLICY_VIOLATION = 1008;
// Reason paired with that code for refusals; "malformed message" also closes with 1008 and is not a denial.
export const WS_FORBIDDEN_REASON = "forbidden";
// Close code the server sends every peer when the board is moved to Trash (SYNC_CLOSE_TRASHED).
export const WS_TRASHED_CODE = 4410;
