import { AppError } from "../../../../shared/kernel/errors/AppError";
import { err, okEmpty } from "../../../../shared/kernel/types/Result";
import type { Result } from "../../../../shared/kernel/types/Result";

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export const validatePassword = (raw: string): Result<void, AppError> =>
  raw.length < PASSWORD_MIN_LENGTH || raw.length > PASSWORD_MAX_LENGTH
    ? err(
        AppError.validation(
          `Password must be ${PASSWORD_MIN_LENGTH} to ${PASSWORD_MAX_LENGTH} characters`
        )
      )
    : okEmpty();
