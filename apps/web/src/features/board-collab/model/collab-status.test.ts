import { describe, expect, it } from "bun:test";

import { deriveCollabStatus } from "./collab-status";

const base = {
  wsconnected: false,
  synced: false,
  wsUnsuccessfulReconnects: 0,
  noAccess: false,
};

describe("deriveCollabStatus", () => {
  it("is connecting before any attempt has failed", () => {
    expect(deriveCollabStatus(base)).toBe("connecting");
  });
  it("is offline after a failed attempt, even while retrying", () => {
    expect(deriveCollabStatus({ ...base, wsUnsuccessfulReconnects: 1 })).toBe(
      "offline"
    );
  });
  it("is syncing then live once connected", () => {
    expect(deriveCollabStatus({ ...base, wsconnected: true })).toBe("syncing");
    expect(
      deriveCollabStatus({ ...base, wsconnected: true, synced: true })
    ).toBe("live");
  });
  it("no-access wins over everything", () => {
    expect(
      deriveCollabStatus({
        ...base,
        wsUnsuccessfulReconnects: 3,
        noAccess: true,
      })
    ).toBe("no-access");
  });
});
