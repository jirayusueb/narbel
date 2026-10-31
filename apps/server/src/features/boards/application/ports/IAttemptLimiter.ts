export interface IAttemptLimiter {
  isBlocked(key: string): Promise<boolean>;
  recordFailure(key: string): Promise<void>;
}
