import type {
  Access,
  MemberRole,
  Role,
  Visibility,
} from "../values/Access";

export interface AccessGrants {
  isOwner: boolean;
  memberRole: MemberRole | null;
  /** role of a share link whose token matched and has not expired */
  shareRole: MemberRole | null;
  visibility: Visibility;
  /** the caller holds a valid unlock cookie for this (password) board */
  unlocked: boolean;
}

const access = (role: Role): Access => ({
  role,
  canRead: true,
  canWrite: role !== "viewer",
});

// Order matters: the most specific grant wins, a public setting is the last resort.
export const resolveAccess = (grants: AccessGrants): Access | null => {
  if (grants.isOwner) {
    return access("owner");
  }
  if (grants.memberRole) {
    return access(grants.memberRole);
  }
  if (grants.shareRole) {
    return access(grants.shareRole);
  }
  if (grants.visibility === "password" && grants.unlocked) {
    return access("viewer");
  }
  if (grants.visibility === "link") {
    return access("viewer");
  }
  return null;
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
