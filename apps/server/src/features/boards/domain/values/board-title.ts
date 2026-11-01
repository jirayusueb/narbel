import { AppError } from "../../../../shared/kernel/errors/app-error";
import { err, ok } from "../../../../shared/kernel/types/result";
import type { Result } from "../../../../shared/kernel/types/result";

export const TITLE_MAX_LENGTH = 120;

export class BoardTitle {
  private constructor(public readonly value: string) {}

  static create(raw: string): Result<BoardTitle, AppError> {
    const value = raw.trim();
    if (value.length < 1 || value.length > TITLE_MAX_LENGTH) {
      return err(
        AppError.validation(`Title must be 1 to ${TITLE_MAX_LENGTH} characters`)
      );
    }
    return ok(new BoardTitle(value));
  }

  // trusted DB source only
  static restore(value: string): BoardTitle {
    return new BoardTitle(value);
  }
}
