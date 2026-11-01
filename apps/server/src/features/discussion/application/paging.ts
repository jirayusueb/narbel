import type { AppError } from "../../../shared/kernel/errors/app-error";
import { decodeCursor } from "../../../shared/kernel/types/cursor";
import type { Cursor } from "../../../shared/kernel/types/cursor";
import { err, ok } from "../../../shared/kernel/types/result";
import type { Result } from "../../../shared/kernel/types/result";

export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 20;

export const parsePaging = (input: {
  cursor?: string;
  limit?: number;
}): Result<{ after: Cursor | null; limit: number }, AppError> => {
  const after = input.cursor ? decodeCursor(input.cursor) : null;
  if (after?.isErr()) {
    return err(after.error);
  }
  return ok({
    after: after?.isOk() ? after.value : null,
    limit: Math.min(
      Math.max(Math.trunc(input.limit ?? DEFAULT_PAGE_SIZE), 1),
      MAX_PAGE_SIZE
    ),
  });
};
