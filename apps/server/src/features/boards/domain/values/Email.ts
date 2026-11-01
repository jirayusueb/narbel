import { AppError } from "../../../../shared/kernel/errors/AppError";
import { err, ok } from "../../../../shared/kernel/types/Result";
import type { Result } from "../../../../shared/kernel/types/Result";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const EMAIL_MAX_LENGTH = 254;

/** Emails are compared lowercased everywhere. */
export class Email {
  private constructor(readonly value: string) {}

  static parse(raw: string): Result<Email, AppError> {
    const value = raw.trim().toLowerCase();
    return value.length <= EMAIL_MAX_LENGTH && EMAIL.test(value)
      ? ok(new Email(value))
      : err(AppError.validation("Enter a valid email address"));
  }
}
