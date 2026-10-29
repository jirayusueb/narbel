import type { IIdGenerator } from "../../application/interfaces/IIdGenerator";

export class UuidGenerator implements IIdGenerator {
  generate() {
    return crypto.randomUUID();
  }
  int() {
    const [value] = crypto.getRandomValues(new Uint32Array(1));
    return Math.floor((value ?? 0) / 2);
  }
}
