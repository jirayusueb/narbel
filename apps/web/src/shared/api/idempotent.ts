import { ApiError } from "./unwrap";

const MAX_IN_PROGRESS_RETRIES = 5;

/**
 * Mutation options for a request sent with an Idempotency-Key. A double submit makes the second
 * request hit the first while it is still running (409); TanStack only runs the latest `mutate`
 * call's callbacks, so that call must retry until the server replays the first response.
 */
export const retryWhileInProgress = {
  retry: (failures: number, error: Error) =>
    error instanceof ApiError &&
    error.status === 409 &&
    failures < MAX_IN_PROGRESS_RETRIES,
  retryDelay: 300,
};
