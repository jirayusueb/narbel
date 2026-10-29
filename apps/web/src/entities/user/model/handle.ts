import type { UserRef } from "./types";

export const handle = (user: Pick<UserRef, "name" | "username">) =>
  user.username ? `@${user.username}` : user.name;
