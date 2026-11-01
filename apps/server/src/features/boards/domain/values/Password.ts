import { AppError } from "../../../../shared/kernel/errors/AppError";
import { err, ok } from "../../../../shared/kernel/types/Result";
import type { Result } from "../../../../shared/kernel/types/Result";

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export class Password {
  private constructor(readonly value: string) {}

  static parse(raw: string): Result<Password, AppError> {
    return raw.length < PASSWORD_MIN_LENGTH || raw.length > PASSWORD_MAX_LENGTH
      ? err(
          AppError.validation(
            `Password must be ${PASSWORD_MIN_LENGTH} to ${PASSWORD_MAX_LENGTH} characters`
          )
        )
      : ok(new Password(raw));
  }
}
