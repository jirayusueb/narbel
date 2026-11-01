import { AppError } from "../../../../shared/kernel/errors/AppError";
import { err, ok } from "../../../../shared/kernel/types/Result";
import type { Result } from "../../../../shared/kernel/types/Result";

export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

const EXTENSION_BY_MIME = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
} as const;
type AvatarMime = keyof typeof EXTENSION_BY_MIME;

const MIME_BY_EXTENSION = Object.fromEntries(
  Object.entries(EXTENSION_BY_MIME).map(([mime, ext]) => [ext, mime])
) as Record<string, AvatarMime>;

/** An avatar upload that passed the type and size checks. */
export class Avatar {
  private constructor(
    readonly value: { readonly mimeType: AvatarMime; readonly size: number }
  ) {}

  static parse(input: {
    mimeType: string;
    size: number;
  }): Result<Avatar, AppError> {
    if (!Object.hasOwn(EXTENSION_BY_MIME, input.mimeType)) {
      return err(
        AppError.unsupportedMediaType("Avatars must be png, jpeg or webp", {
          allowed: Object.keys(EXTENSION_BY_MIME),
        })
      );
    }
    if (input.size < 1) {
      return err(AppError.validation("File is empty"));
    }
    return input.size > MAX_AVATAR_BYTES
      ? err(
          AppError.payloadTooLarge("Avatar exceeds 2 MiB", {
            maxBytes: MAX_AVATAR_BYTES,
          })
        )
      : ok(
          new Avatar({
            mimeType: input.mimeType as AvatarMime,
            size: input.size,
          })
        );
  }

  /** The mime type an avatar key promises, or null when the key is not a valid avatar key for `userId`. */
  static mimeOfKey(userId: string, key: string) {
    const prefix = `avatars/${userId}/`;
    if (!key.startsWith(prefix)) {
      return null;
    }
    const match = /^[A-Za-z0-9-]{1,64}\.(?<ext>png|jpg|webp)$/u.exec(
      key.slice(prefix.length)
    );
    const ext = match?.groups?.ext;
    return ext ? (MIME_BY_EXTENSION[ext] ?? null) : null;
  }

  /** For serving: the key came from our own database, so only the extension matters. */
  static mimeOfStoredKey(key: string) {
    return (
      MIME_BY_EXTENSION[key.split(".").pop() ?? ""] ??
      "application/octet-stream"
    );
  }

  /** Objects live under the user's own prefix, so a key can never point at someone else's file. */
  keyFor(userId: string, uploadId: string) {
    return `avatars/${userId}/${uploadId}.${EXTENSION_BY_MIME[this.value.mimeType]}`;
  }
}
