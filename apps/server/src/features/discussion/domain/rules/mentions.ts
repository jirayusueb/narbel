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

// notifications and emails show the excerpt as plain text, so markdown syntax must not leak into it
const MARKDOWN_SYNTAX: [RegExp, string][] = [
  [/!?\[(?<text>[^\]]*)\]\([^)]*\)/gu, "$<text>"],
  [/`{1,3}/gu, ""],
  [/(?<marker>\*{1,3}|~~)(?<inner>\S(?:.*?\S)?)\k<marker>/gu, "$<inner>"],
  // underscore emphasis never starts or ends inside a word, so snake_case and @user_names survive
  [
    /(?<![\p{L}\p{N}_])(?<marker>_{1,3})(?<inner>\S(?:.*?\S)?)\k<marker>(?![\p{L}\p{N}_])/gu,
    "$<inner>",
  ],
  [/^\s{0,3}(?:#{1,6}\s+|>\s?|[-*+]\s+|\d+\.\s+)/gmu, ""],
];

export const excerptOf = (body: string) => {
  let plain = body;
  for (const [pattern, replacement] of MARKDOWN_SYNTAX) {
    plain = plain.replaceAll(pattern, replacement);
  }
  const flat = plain.replaceAll(/\s+/gu, " ").trim();
  return flat.length > EXCERPT_LENGTH
    ? `${flat.slice(0, EXCERPT_LENGTH - 1)}…`
    : flat;
};
