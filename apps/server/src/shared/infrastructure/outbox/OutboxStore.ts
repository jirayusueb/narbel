export interface ClaimedMessage {
  id: string;
  type: string;
  payload: unknown;
  /** attempts including this one */
  attempts: number;
}

export interface IOutboxStore {
  /**
   * Leases up to `limit` due messages to the caller: bumps `attempts` and pushes `nextAttemptAt`
   * to `leaseUntil(attemptsBefore)`, so a crashed worker's rows come due again and a second
   * worker never sees a leased row.
   */
  claimDue(
    now: Date,
    limit: number,
    leaseUntil: (attemptsBefore: number) => Date
  ): Promise<ClaimedMessage[]>;
  markSent(id: string, at: Date): Promise<void>;
  /** Records the failure; `dead` stops all further attempts. */
  markFailed(id: string, error: string, dead: boolean): Promise<void>;
}
