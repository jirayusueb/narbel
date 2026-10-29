export type BoardRole = "owner" | "editor" | "viewer";
export type Visibility = "private" | "link" | "password";

export interface Board {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  role: BoardRole;
  canWrite: boolean;
  visibility: Visibility;
  shared: boolean;
}

export interface BoardMember {
  // null while an emailed invite has not been claimed by a sign-in yet
  userId: string | null;
  name: string;
  email: string;
  role: "editor" | "viewer";
}

export interface BoardAccess {
  visibility: Visibility;
  hasPassword: boolean;
  share: {
    enabled: boolean;
    url: string;
    role: "editor" | "viewer";
    expiresAt: string | null;
  } | null;
  members: BoardMember[];
}
