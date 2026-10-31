import { describe, expect, it } from "bun:test";

import { deriveCollabStatus, isAccessDenial } from "./collab-status";

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

describe("isAccessDenial", () => {
  it("is a refusal at connect or a revoke later, not a malformed message or a trashed board", () => {
    expect(isAccessDenial({ code: 1008, reason: "forbidden" })).toBe(true);
    expect(isAccessDenial({ code: 1008, reason: "access-revoked" })).toBe(true);
    expect(isAccessDenial({ code: 1008, reason: "malformed message" })).toBe(
      false
    );
    expect(isAccessDenial({ code: 4410, reason: "board-trashed" })).toBe(false);
  });
});
