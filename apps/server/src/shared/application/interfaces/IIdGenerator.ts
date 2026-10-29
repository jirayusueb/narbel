export interface IIdGenerator {
  generate(): string;
  /** Random unsigned 31-bit integer, used for Excalidraw seeds and version nonces. */
  int(): number;
}
