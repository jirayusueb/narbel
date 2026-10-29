import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

import type { IPasswordHasher } from "../../application/ports/IPasswordHasher";

const SALT_BYTES = 16;
const KEY_BYTES = 64;

const derive = (plain: string, salt: Buffer) =>
  new Promise<Buffer>((resolve, reject) => {
    scrypt(plain.normalize("NFKC"), salt, KEY_BYTES, (error, key) => {
      if (error) {
        reject(error);
      } else {
        resolve(key);
      }
    });
  });

/** `scrypt$<salt>$<key>`, both base64url; cost parameters are node's defaults. */
export class ScryptPasswordHasher implements IPasswordHasher {
  async hash(plain: string) {
    const salt = randomBytes(SALT_BYTES);
    const key = await derive(plain, salt);
    return `scrypt$${salt.toString("base64url")}$${key.toString("base64url")}`;
  }

  async verify(plain: string, hash: string) {
    const [scheme, salt, key] = hash.split("$");
    if (scheme !== "scrypt" || !salt || !key) {
      return false;
    }
    const expected = Buffer.from(key, "base64url");
    const actual = await derive(plain, Buffer.from(salt, "base64url"));
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }
}
