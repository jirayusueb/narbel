export interface IAttemptLimiter {
  isBlocked(key: string): boolean;
  recordFailure(key: string): void;
}
