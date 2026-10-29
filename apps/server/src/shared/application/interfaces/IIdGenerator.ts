export interface IIdGenerator {
  generate(): string;
  /** Random unsigned 31-bit integer, used for Excalidraw seeds and version nonces. */
  int(): number;
  /** 43-character url-safe secret (256 bits), used for share links. */
  token(): string;
}
