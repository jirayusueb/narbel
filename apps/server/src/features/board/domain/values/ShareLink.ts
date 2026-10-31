import { AppError } from "../../../../shared/kernel/errors/AppError";
import { err, ok } from "../../../../shared/kernel/types/Result";
import type { Result } from "../../../../shared/kernel/types/Result";
import type { MemberRole } from "./Access";

export interface ShareLink {
  token: string;
  role: MemberRole;
  /** null for a link that never expires */
  expiresAt: Date | null;
}

/** An expiry must lie in the future when it is set. */
export const parseShareExpiry = (
  raw: string,
  now: Date
): Result<Date, AppError> => {
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) || date <= now
    ? err(AppError.validation("shareExpiresAt must be a future date"))
    : ok(date);
};

/** The role the link grants to whoever presents `token`; an expired link grants nothing. */
export const shareRoleFor = (
  link: ShareLink | null,
  token: string | undefined,
  now: Date
): MemberRole | null => {
  if (!link || !token || link.token !== token) {
    return null;
  }
  return link.expiresAt && link.expiresAt <= now ? null : link.role;
};
