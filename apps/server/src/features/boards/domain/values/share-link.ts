import { AppError } from "../../../../shared/kernel/errors/app-error";
import { err, ok } from "../../../../shared/kernel/types/result";
import type { Result } from "../../../../shared/kernel/types/result";
import type { MemberRole } from "./access";

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

  /** Trusted DB source; restore does not re-run create-time checks. */
  static restore(fields: {
    boardId: string;
    token: string;
    role: MemberRole;
    createdAt: Date;
    expiresAt: Date | null;
  }): ShareLink {
    return ShareLink.create(fields);
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
