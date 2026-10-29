import type { IIdGenerator } from "../../application/interfaces/IIdGenerator";

const TOKEN_BYTES = 32;

export class UuidGenerator implements IIdGenerator {
  generate() {
    return crypto.randomUUID();
  }
  int() {
    const [value] = crypto.getRandomValues(new Uint32Array(1));
    return Math.floor((value ?? 0) / 2);
  }
  token() {
    return Buffer.from(
      crypto.getRandomValues(new Uint8Array(TOKEN_BYTES))
    ).toString("base64url");
  }
}
