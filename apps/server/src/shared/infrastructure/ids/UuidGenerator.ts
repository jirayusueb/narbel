import type { IIdGenerator } from "../../application/interfaces/IIdGenerator";

export class UuidGenerator implements IIdGenerator {
  generate() {
    return crypto.randomUUID();
  }
  int() {
    return crypto.getRandomValues(new Uint32Array(1))[0]! >>> 1;
  }
}
