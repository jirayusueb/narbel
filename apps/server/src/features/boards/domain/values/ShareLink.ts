import { AppError } from "../../../../shared/kernel/errors/AppError";
import { err, ok } from "../../../../shared/kernel/types/Result";
import type { Result } from "../../../../shared/kernel/types/Result";
import type { MemberRole } from "./Access";

export class ShareLink {
  private constructor(
    readonly boardId: string,
    readonly token: string,
    readonly role: MemberRole,
    readonly createdAt: Date,
    /** null for a link that never expires */
    readonly expiresAt: Date | null
  ) {}

  static create(fields: {
    boardId: string;
    token: string;
    role: MemberRole;
    createdAt: Date;
    expiresAt: Date | null;
  }): ShareLink {
    return new ShareLink(
      fields.boardId,
      fields.token,
      fields.role,
      fields.createdAt,
      fields.expiresAt
    );
  }

  /** An expiry must lie in the future when it is set. */
  static parseExpiry(raw: string, now: Date): Result<Date, AppError> {
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) || date <= now
      ? err(AppError.validation("shareExpiresAt must be a future date"))
      : ok(date);
  }

  /** The role the link grants to whoever presents `token`; an expired link grants nothing. */
  roleFor(token: string | undefined, now: Date): MemberRole | null {
    if (!token || this.token !== token) {
      return null;
    }
    return this.expiresAt && this.expiresAt <= now ? null : this.role;
  }
}
