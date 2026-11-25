import { AppError } from "../../../../shared/kernel/errors/app-error";
import { err, ok, okEmpty } from "../../../../shared/kernel/types/result";
import type { Result } from "../../../../shared/kernel/types/result";

// fileId becomes part of the S3 key, so it must not be able to contain path separators.
const FILE_ID = /^[A-Za-z0-9_-]{1,128}$/u;

const ARTIFACT_MIME = {
  html: "text/html",
  markdown: "text/markdown",
} as const;
export type ArtifactFormat = keyof typeof ARTIFACT_MIME;
const MAX_ARTIFACT_NAME = 200;

export class UploadRules {
  static readonly MAX_FILE_BYTES = 10 * 1024 * 1024;
  static readonly ALLOWED_MIME_TYPES = [
    "image/png",
    "image/jpeg",
    "image/gif",
    "image/webp",
    "image/svg+xml",
  ] as const;
  static readonly MAX_INLINE_IMAGE_BYTES = 700 * 1024;
  static readonly MAX_IMAGE_PIXELS = 16_000_000;
  static readonly MAX_ARTIFACT_BYTES = 1024 * 1024;
  static readonly ARTIFACT_FORMATS = Object.keys(
    ARTIFACT_MIME
  ) as ArtifactFormat[];

  private constructor() {
    // static rules only
  }

  static validateUpload(input: {
    fileId: string;
    mimeType: string;
    size: number;
  }): Result<void, AppError> {
    if (!FILE_ID.test(input.fileId)) {
      return err(
        AppError.validation(
          "fileId must be 1 to 128 characters of A-Z a-z 0-9 _ -"
        )
      );
    }
    if (
      !(UploadRules.ALLOWED_MIME_TYPES as readonly string[]).includes(
        input.mimeType
      )
    ) {
      return err(
        AppError.unsupportedMediaType(
          "Only png, jpeg, gif, webp and svg images are allowed",
          {
            allowed: UploadRules.ALLOWED_MIME_TYPES,
          }
        )
      );
    }
    if (input.size < 1) {
      return err(AppError.validation("File is empty"));
    }
    if (input.size > UploadRules.MAX_FILE_BYTES) {
      return err(
        AppError.payloadTooLarge("File exceeds 10 MiB", {
          maxBytes: UploadRules.MAX_FILE_BYTES,
        })
      );
    }
    return okEmpty();
  }

  /** Checks an HTML or Markdown artifact and answers the mime type it is stored under. */
  static validateArtifact(input: {
    format: string;
    name: string;
    bytes: Uint8Array;
  }): Result<{ mimeType: string; name: string }, AppError> {
    if (!Object.hasOwn(ARTIFACT_MIME, input.format)) {
      return err(
        AppError.validation("format must be html or markdown", {
          allowed: UploadRules.ARTIFACT_FORMATS,
        })
      );
    }
    const name = input.name.trim();
    if (name.length === 0 || name.length > MAX_ARTIFACT_NAME) {
      return err(
        AppError.validation(`name must be 1 to ${MAX_ARTIFACT_NAME} characters`)
      );
    }
    if (input.bytes.length === 0) {
      return err(AppError.validation("Artifact is empty"));
    }
    if (input.bytes.length > UploadRules.MAX_ARTIFACT_BYTES) {
      return err(
        AppError.payloadTooLarge("Artifact exceeds 1 MiB", {
          maxBytes: UploadRules.MAX_ARTIFACT_BYTES,
        })
      );
    }
    return ok({
      mimeType: ARTIFACT_MIME[input.format as ArtifactFormat],
      name,
    });
  }
}
