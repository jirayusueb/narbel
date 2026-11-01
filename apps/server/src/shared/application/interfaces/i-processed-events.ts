/** Which integration events a consumer has already handled, so a retried delivery is a no-op. */
export interface IProcessedEvents {
  /** Records `eventId` for `consumer` in the caller's transaction; false when it was recorded before. */
  claim(consumer: string, eventId: string): Promise<boolean>;
}
