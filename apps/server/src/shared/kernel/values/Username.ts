import { AppError } from "../errors/AppError";
import { err, ok } from "../types/Result";
import type { Result } from "../types/Result";

export const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/u;

/** Usernames are matched case-insensitively and stored lowercase. */
export const parseUsername = (raw: string): Result<string, AppError> => {
  const username = raw.trim().toLowerCase();
  return USERNAME_PATTERN.test(username)
    ? ok(username)
    : err(
        AppError.validation(
          "Username must be 3 to 20 characters: letters, digits or underscore"
        )
      );
};
