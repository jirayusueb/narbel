import { AppError } from "../../../../shared/kernel/errors/AppError";
import { err, okEmpty } from "../../../../shared/kernel/types/Result";
import type { Result } from "../../../../shared/kernel/types/Result";

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const ALLOWED_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
] as const;

// fileId becomes part of the S3 key, so it must not be able to contain path separators.
const FILE_ID = /^[A-Za-z0-9_-]{1,128}$/u;

export const validateUpload = (input: {
  fileId: string;
  mimeType: string;
  size: number;
}): Result<void, AppError> => {
  if (!FILE_ID.test(input.fileId)) {
    return err(
      AppError.validation(
        "fileId must be 1 to 128 characters of A-Z a-z 0-9 _ -"
      )
    );
  }
  if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(input.mimeType)) {
    return err(
      AppError.unsupportedMediaType(
        "Only png, jpeg, gif, webp and svg images are allowed",
        {
          allowed: ALLOWED_MIME_TYPES,
        }
      )
    );
  }
  if (input.size < 1) {
    return err(AppError.validation("File is empty"));
  }
  if (input.size > MAX_FILE_BYTES) {
    return err(
      AppError.payloadTooLarge("File exceeds 10 MiB", {
        maxBytes: MAX_FILE_BYTES,
      })
    );
  }
  return okEmpty();
};

export const MAX_INLINE_IMAGE_BYTES = 700 * 1024;

export const MAX_IMAGE_PIXELS = 16_000_000;
