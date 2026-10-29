export const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/u;

export const normalizeUsername = (raw: string) =>
  raw.toLowerCase().replaceAll(/[^a-z0-9_]/gu, "");

export interface UsernameStatus {
  tone: "muted" | "pending" | "error" | "ok";
  text: string;
}

export const usernameStatus = ({
  username,
  valid,
  available,
  serverError,
}: {
  username: string;
  valid: boolean;
  available: boolean | undefined;
  serverError: string | null;
}): UsernameStatus => {
  if (serverError) {
    return { tone: "error", text: serverError };
  }
  if (!valid) {
    return username.length > 0
      ? { tone: "error", text: "Use at least 3 characters." }
      : { tone: "muted", text: "3 to 20 letters, numbers or underscores." };
  }
  if (available === undefined) {
    return { tone: "pending", text: "Checking availability…" };
  }
  return available
    ? { tone: "ok", text: `@${username} is available.` }
    : { tone: "error", text: `@${username} is already taken.` };
};
