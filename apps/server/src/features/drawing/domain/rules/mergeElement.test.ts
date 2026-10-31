import { describe, expect, it } from "bun:test";

import { shouldAcceptIncoming } from "./mergeElement";

describe("shouldAcceptIncoming", () => {
  it("accepts when there is no local element", () => {
    expect(
      shouldAcceptIncoming(undefined, { version: 1, versionNonce: 5 })
    ).toBe(true);
  });

  it("accepts a higher version and rejects a lower one", () => {
    const local = { version: 2, versionNonce: 5 };
    expect(shouldAcceptIncoming(local, { version: 3, versionNonce: 9 })).toBe(
      true
    );
    expect(shouldAcceptIncoming(local, { version: 1, versionNonce: 1 })).toBe(
      false
    );
  });

  it("breaks equal-version ties on the lower nonce", () => {
    const local = { version: 2, versionNonce: 5 };
    expect(shouldAcceptIncoming(local, { version: 2, versionNonce: 4 })).toBe(
      true
    );
    expect(shouldAcceptIncoming(local, { version: 2, versionNonce: 5 })).toBe(
      false
    );
    expect(shouldAcceptIncoming(local, { version: 2, versionNonce: 6 })).toBe(
      false
    );
  });
});
