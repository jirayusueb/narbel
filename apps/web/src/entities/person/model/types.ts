export interface UserRef {
  id: string;
  name: string;
  username: string | null;
  // undefined: unknown, so the avatar endpoint is tried and the generated avatar covers a 404.
  avatarUrl?: string | null;
}
