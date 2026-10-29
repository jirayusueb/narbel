import type { IFileStorage } from "../../../../shared/application/interfaces/IFileStorage";
import type { IIdGenerator } from "../../../../shared/application/interfaces/IIdGenerator";
import type { IProfileRepository } from "../../../../shared/application/interfaces/IProfiles";
import { AppError } from "../../../../shared/kernel/errors/AppError";
import { err, ok } from "../../../../shared/kernel/types/Result";
import type { Result } from "../../../../shared/kernel/types/Result";
import { parseUsername } from "../../../../shared/kernel/values/Username";
import {
  MAX_AVATAR_BYTES,
  avatarKey,
  avatarMimeOfKey,
  mimeOfStoredKey,
  validateAvatarUpload,
} from "../../domain/values/Avatar";
import { parseDisplayName } from "../../domain/values/DisplayName";
import { toMeDto } from "../MeDto";
import type { MeDto } from "../MeDto";

const PRESIGN_SECONDS = 5 * 60;

const conflict = (reason: string, message: string) =>
  new AppError("Conflict", message, { reason });

/** Everything a signed-in user does to their own profile. */
export class ProfileUseCases {
  constructor(
    private readonly profiles: IProfileRepository,
    private readonly storage: IFileStorage,
    private readonly ids: IIdGenerator
  ) {}

  async me(userId: string): Promise<Result<MeDto, AppError>> {
    const person = await this.profiles.findPerson(userId);
    return person ? ok(toMeDto(person)) : err(AppError.unauthorized());
  }

  async rename(userId: string, rawName: string) {
    const name = parseDisplayName(rawName);
    if (name.isErr()) {
      return err<MeDto, AppError>(name.error);
    }
    await this.profiles.setName(userId, name.value);
    return await this.me(userId);
  }

  async claimUsername(userId: string, rawUsername: string) {
    const username = parseUsername(rawUsername);
    if (username.isErr()) {
      return err<MeDto, AppError>(username.error);
    }
    const outcome = await this.profiles.claimUsername(userId, username.value);
    if (outcome === "taken") {
      return err<MeDto, AppError>(
        conflict("UsernameTaken", "That username is taken")
      );
    }
    if (outcome === "already-set") {
      return err<MeDto, AppError>(
        conflict("UsernameAlreadySet", "Your username is set and cannot change")
      );
    }
    return await this.me(userId);
  }

  async isUsernameAvailable(rawUsername: string) {
    const username = parseUsername(rawUsername);
    return {
      available:
        username.isOk() && (await this.profiles.isUsernameFree(username.value)),
    };
  }

  presignAvatar(
    userId: string,
    input: { mimeType: string; size: number }
  ): Result<{ uploadUrl: string; key: string }, AppError> {
    const valid = validateAvatarUpload(input);
    if (valid.isErr()) {
      return err(valid.error);
    }
    const key = avatarKey(userId, this.ids.generate(), input.mimeType);
    return ok({
      key,
      uploadUrl: this.storage.presignUpload(
        key,
        input.mimeType,
        PRESIGN_SECONDS
      ),
    });
  }

  async confirmAvatar(userId: string, key: string) {
    const mime = avatarMimeOfKey(userId, key);
    if (!mime) {
      return err<MeDto, AppError>(AppError.validation("Invalid avatar key"));
    }
    const stored = await this.storage.stat(key);
    if (!stored) {
      return err<MeDto, AppError>(AppError.notFound("Upload"));
    }
    // the PUT is signed for one content type, but size is only known after the bytes arrive
    if (stored.size > MAX_AVATAR_BYTES || stored.type !== mime) {
      await this.storage.delete(key);
      return err<MeDto, AppError>(
        AppError.validation("Uploaded file does not match the presigned avatar")
      );
    }
    const previous = await this.profiles.avatarKeyOf(userId);
    await this.profiles.setAvatarKey(userId, key);
    await this.discard(previous, key);
    return await this.me(userId);
  }

  async removeAvatar(userId: string) {
    const previous = await this.profiles.avatarKeyOf(userId);
    await this.profiles.setAvatarKey(userId, null);
    await this.discard(previous, null);
    return await this.me(userId);
  }

  async avatarOf(
    userId: string
  ): Promise<
    Result<{ stream: ReadableStream<Uint8Array>; mimeType: string }, AppError>
  > {
    const key = await this.profiles.avatarKeyOf(userId);
    return key
      ? ok({ stream: this.storage.stream(key), mimeType: mimeOfStoredKey(key) })
      : err(AppError.notFound("Avatar"));
  }

  // the old object is garbage once the profile points elsewhere; failing to delete it must not fail the request
  private async discard(previous: string | null, current: string | null) {
    if (previous && previous !== current) {
      await this.storage.delete(previous).catch((error: unknown) => {
        console.error("Could not delete the replaced avatar", error);
      });
    }
  }
}
