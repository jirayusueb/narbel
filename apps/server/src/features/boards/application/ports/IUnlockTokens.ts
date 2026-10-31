/** Proof, kept in a cookie, that a visitor knew the board password. */
export interface IUnlockTokens {
  /** Bound to the password hash, so changing the password revokes every issued proof. */
  issue(boardId: string, passwordHash: string): string;
  verify(boardId: string, passwordHash: string, proof: string): boolean;
}
