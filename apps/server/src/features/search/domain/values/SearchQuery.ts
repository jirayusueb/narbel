export const SEARCH_MIN_LENGTH = 2;
export const SEARCH_MAX_LENGTH = 100;
const SNIPPET_RADIUS = 40;

const escapeWith = (value: string, pattern: RegExp) =>
  value.replace(pattern, "\\$&");

/** A case-insensitive substring needle; no tokenizing, so it works for scripts without word breaks such as Thai. */
export class SearchQuery {
  private constructor(public readonly value: string) {}

  /** Null when the trimmed query is too short to search. */
  static parse(raw: string): SearchQuery | null {
    const value = raw.trim().slice(0, SEARCH_MAX_LENGTH).trim();
    return value.length < SEARCH_MIN_LENGTH ? null : new SearchQuery(value);
  }

  /** ILIKE pattern with LIKE wildcards in the query made literal. */
  likePattern(): string {
    return `%${escapeWith(this.value, /[\\%_]/gu)}%`;
  }

  /** The in-memory twin of `ILIKE likePattern()`: a case-insensitive substring, wildcards literal. */
  matches(text: string): boolean {
    return text.toLowerCase().includes(this.value.toLowerCase());
  }

  /** The text around the first match, whitespace collapsed; the text's head when nothing matches. */
  snippet(text: string): string {
    const flat = text.replaceAll(/\s+/gu, " ").trim();
    const found = new RegExp(
      escapeWith(this.value, /[.*+?^${}()|[\]\\]/gu),
      "iu"
    ).exec(flat);
    if (!found) {
      return flat.slice(0, SNIPPET_RADIUS * 2);
    }
    const start = Math.max(0, found.index - SNIPPET_RADIUS);
    const end = found.index + found[0].length + SNIPPET_RADIUS;
    return `${start > 0 ? "…" : ""}${flat.slice(start, end)}${end < flat.length ? "…" : ""}`;
  }
}
