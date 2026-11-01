export const VISIBILITIES = ["private", "link", "password"] as const;
export type Visibility = (typeof VISIBILITIES)[number];

export type MemberRole = "editor" | "viewer";
export type Role = "owner" | MemberRole;

export interface Access {
  role: Role;
  canRead: true;
  canWrite: boolean;
}
