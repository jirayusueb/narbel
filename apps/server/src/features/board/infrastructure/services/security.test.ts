import { describe, expect, it } from "bun:test";

import { HmacUnlockTokens } from "./HmacUnlockTokens";
import { ScryptPasswordHasher } from "./ScryptPasswordHasher";

describe("ScryptPasswordHasher", () => {
  const hasher = new ScryptPasswordHasher();

  it("verifies the right password and rejects others", async () => {
    const hash = await hasher.hash("correct horse");
    expect(await hasher.verify("correct horse", hash)).toBe(true);
    expect(await hasher.verify("wrong horse", hash)).toBe(false);
  });

  it("salts every hash and never stores the plain text", async () => {
    const [a, b] = await Promise.all([
      hasher.hash("same"),
      hasher.hash("same"),
    ]);
    expect(a).not.toBe(b);
    expect(a).not.toContain("same");
  });

  it("rejects malformed hashes", async () => {
    expect(await hasher.verify("x", "plain")).toBe(false);
    expect(await hasher.verify("x", "bcrypt$a$b")).toBe(false);
  });
});

describe("HmacUnlockTokens", () => {
  const tokens = new HmacUnlockTokens("secret-secret-secret-secret-secret");

  it("verifies its own proof", () => {
    const proof = tokens.issue("b1", "hash");
    expect(tokens.verify("b1", "hash", proof)).toBe(true);
  });

  it("rejects another board, another password hash, another secret and garbage", () => {
    const proof = tokens.issue("b1", "hash");
    expect(tokens.verify("b2", "hash", proof)).toBe(false);
    expect(tokens.verify("b1", "other-hash", proof)).toBe(false);
    expect(
      new HmacUnlockTokens("different-secret").verify("b1", "hash", proof)
    ).toBe(false);
    expect(tokens.verify("b1", "hash", "")).toBe(false);
    expect(tokens.verify("b1", "hash", `${proof}x`)).toBe(false);
  });
});
