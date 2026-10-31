import { createHmac, timingSafeEqual } from "node:crypto";

import type { IUnlockTokens } from "../../application/ports/IUnlockTokens";

export class HmacUnlockTokens implements IUnlockTokens {
  constructor(private readonly secret: string) {}

  issue(boardId: string, passwordHash: string) {
    return createHmac("sha256", this.secret)
      .update(`${boardId}\n${passwordHash}`)
      .digest("base64url");
  }

  verify(boardId: string, passwordHash: string, proof: string) {
    const expected = Buffer.from(this.issue(boardId, passwordHash));
    const actual = Buffer.from(proof);
    return (
      expected.length === actual.length && timingSafeEqual(expected, actual)
    );
  }
}
