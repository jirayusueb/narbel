// Only same-origin relative paths survive: "//host" and "/\host" are protocol-relative to browsers.
export const safeRedirect = (value: unknown): string | undefined => {
  if (typeof value !== "string" || !value.startsWith("/")) {
    return undefined;
  }
  if (value.startsWith("//") || value.startsWith("/\\")) {
    return undefined;
  }
  // Control characters (tab, newline) are stripped by URL parsers and can hide a second slash.
  return /\p{Cc}/u.test(value) ? undefined : value;
};
