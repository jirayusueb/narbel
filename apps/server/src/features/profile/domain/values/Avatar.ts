import { AppError } from "../../../../shared/kernel/errors/AppError";
import { err, okEmpty } from "../../../../shared/kernel/types/Result";
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

export const validateAvatarUpload = (input: {
  mimeType: string;
  size: number;
}): Result<void, AppError> => {
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
    : okEmpty();
};

/** Objects live under the user's own prefix, so a key can never point at someone else's file. */
export const avatarKey = (userId: string, uploadId: string, mime: string) =>
  `avatars/${userId}/${uploadId}.${EXTENSION_BY_MIME[mime as AvatarMime]}`;

/** The mime type an avatar key promises, or null when the key is not a valid avatar key for `userId`. */
export const avatarMimeOfKey = (userId: string, key: string) => {
  const prefix = `avatars/${userId}/`;
  if (!key.startsWith(prefix)) {
    return null;
  }
  const match = /^[A-Za-z0-9-]{1,64}\.(?<ext>png|jpg|webp)$/u.exec(
    key.slice(prefix.length)
  );
  const ext = match?.groups?.ext;
  return ext ? (MIME_BY_EXTENSION[ext] ?? null) : null;
};

/** For serving: the key came from our own database, so only the extension matters. */
export const mimeOfStoredKey = (key: string) =>
  MIME_BY_EXTENSION[key.split(".").pop() ?? ""] ?? "application/octet-stream";
