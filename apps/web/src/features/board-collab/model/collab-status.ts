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

// Close code the server sends when the session is refused after the upgrade (BoardSyncController) or a later
// access recheck finds the person can no longer read the board (SYNC_CLOSE_REVOKED).
const WS_POLICY_VIOLATION = 1008;
// Reasons paired with that code for a denial; "malformed message" also closes with 1008 and is not one.
const WS_FORBIDDEN_REASON = "forbidden";
const WS_REVOKED_REASON = "access-revoked";

/** The server will not let this person read the board: reconnecting cannot help. */
export const isAccessDenial = ({
  code,
  reason,
}: Pick<CloseEvent, "code" | "reason">) =>
  code === WS_POLICY_VIOLATION &&
  (reason === WS_FORBIDDEN_REASON || reason === WS_REVOKED_REASON);

// Close code the server sends every peer when the board is moved to Trash (SYNC_CLOSE_TRASHED).
export const WS_TRASHED_CODE = 4410;
