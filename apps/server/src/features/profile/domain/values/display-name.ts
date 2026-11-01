import { AppError } from "../../../../shared/kernel/errors/app-error";
import { err, ok } from "../../../../shared/kernel/types/result";
import type { Result } from "../../../../shared/kernel/types/result";

export const MAX_NAME_LENGTH = 60;

export class DisplayName {
  private constructor(readonly value: string) {}

  static parse(raw: string): Result<DisplayName, AppError> {
    const name = raw.trim();
    return name.length < 1 || name.length > MAX_NAME_LENGTH
      ? err(
          AppError.validation(`Name must be 1 to ${MAX_NAME_LENGTH} characters`)
        )
      : ok(new DisplayName(name));
  }
}
