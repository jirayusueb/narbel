import { AppError } from "../../../../shared/kernel/errors/AppError";
import { err, ok } from "../../../../shared/kernel/types/Result";
import type { Result } from "../../../../shared/kernel/types/Result";

export const MAX_NAME_LENGTH = 60;

export const parseDisplayName = (raw: string): Result<string, AppError> => {
  const name = raw.trim();
  return name.length < 1 || name.length > MAX_NAME_LENGTH
    ? err(
        AppError.validation(`Name must be 1 to ${MAX_NAME_LENGTH} characters`)
      )
    : ok(name);
};
