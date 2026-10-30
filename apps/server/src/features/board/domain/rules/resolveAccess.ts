import type { Access, MemberRole, Role, Visibility } from "../values/Access";

export interface AccessGrants {
  isOwner: boolean;
  memberRole: MemberRole | null;
  /** role of a share link whose token matched and has not expired */
  shareRole: MemberRole | null;
  visibility: Visibility;
  /** the caller holds a valid unlock cookie for this (password) board */
  unlocked: boolean;
  /** the caller is an authenticated user; guests never get write access */
  signedIn: boolean;
}

const access = (role: Role): Access => ({
  role,
  canRead: true,
  canWrite: role !== "viewer",
});

// Order matters: the most specific grant wins, a public setting is the last resort.
const grantedRole = (grants: AccessGrants): Role | null => {
  if (grants.isOwner) {
    return "owner";
  }
  if (grants.memberRole) {
    return grants.memberRole;
  }
  if (grants.shareRole) {
    return grants.shareRole;
  }
  if (
    grants.visibility === "link" ||
    (grants.visibility === "password" && grants.unlocked)
  ) {
    return "viewer";
  }
  return null;
};

export const resolveAccess = (grants: AccessGrants): Access | null => {
  const role = grantedRole(grants);
  return role && access(grants.signedIn ? role : "viewer");
};

export interface ShareLink {
  token: string;
  role: MemberRole;
  expiresAt: Date | null;
}

export const shareRoleFor = (
  share: ShareLink | null,
  token: string | undefined,
  now: Date
): MemberRole | null => {
  if (!share || !token || share.token !== token) {
    return null;
  }
  return share.expiresAt && share.expiresAt <= now ? null : share.role;
};
