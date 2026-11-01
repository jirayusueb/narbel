/** Everything a caller can present as proof of access. All parts are optional; the context asked decides what they are worth. */
export interface Actor {
  userId?: string;
  email?: string;
  name?: string;
  shareToken?: string;
  unlockProof?: string;
}
