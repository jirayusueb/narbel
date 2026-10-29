import { USERNAME_PATTERN } from "../../../../shared/kernel/values/Username";

const EXCERPT_LENGTH = 140;

// `@name` not glued to a word or another `@` (so emails and `a@b` are ignored)
const MENTION = /(?<![\w@])@(?<name>[A-Za-z0-9_]{3,20})(?![\w@])/gu;

/** Distinct lowercase usernames mentioned in markdown, in order of appearance. */
export const extractMentions = (markdown: string): string[] => {
  const names = new Set<string>();
  for (const match of markdown.matchAll(MENTION)) {
    const name = (match.groups?.name ?? "").toLowerCase();
    if (USERNAME_PATTERN.test(name)) {
      names.add(name);
    }
  }
  return [...names];
};

export const excerptOf = (body: string) => {
  const flat = body.replaceAll(/\s+/gu, " ").trim();
  return flat.length > EXCERPT_LENGTH
    ? `${flat.slice(0, EXCERPT_LENGTH - 1)}…`
    : flat;
};
