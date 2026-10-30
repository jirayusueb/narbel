export type IdempotencyClaim =
  | { kind: "proceed" }
  /** the store is unavailable: run the request without dedupe */
  | { kind: "untracked" }
  | { kind: "pending" }
  | { kind: "mismatch" }
  | { kind: "replay"; status: number; body: string };

export interface IIdempotencyStore {
  /** Claims `key` for the first caller; later callers see the stored outcome. */
  claim(key: string, fingerprint: string): Promise<IdempotencyClaim>;
  /** Stores the response a duplicate will replay. */
  complete(
    key: string,
    fingerprint: string,
    status: number,
    body: string
  ): Promise<void>;
  /** Frees the key so a retry runs the request again. */
  release(key: string): Promise<void>;
}
