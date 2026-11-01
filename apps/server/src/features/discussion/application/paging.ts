import { AppError } from "../../../shared/kernel/errors/app-error";
import { decodeCursor } from "../../../shared/kernel/types/cursor";
import { err, ok } from "../../../shared/kernel/types/result";
import type { Result } from "../../../shared/kernel/types/result";

export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 20;

export const parsePaging = (input: {
  cursor?: string;
  limit?: number;
}): Result<
  { after: ReturnType<typeof decodeCursor>; limit: number },
  AppError
> => {
  const after = input.cursor ? decodeCursor(input.cursor) : null;
  return input.cursor && !after
    ? err(AppError.validation("Invalid cursor"))
    : ok({
        after,
        limit: Math.min(
          Math.max(Math.trunc(input.limit ?? DEFAULT_PAGE_SIZE), 1),
          MAX_PAGE_SIZE
        ),
      });
};
