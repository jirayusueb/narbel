import { describe, expect, it } from "bun:test";

import { SearchQuery } from "./SearchQuery";

const parse = (raw: string) => {
  const query = SearchQuery.parse(raw);
  if (!query) {
    throw new Error("expected a query");
  }
  return query;
};

describe("SearchQuery", () => {
  it("rejects queries under 2 characters after trimming", () => {
    expect(SearchQuery.parse(" a ")).toBeNull();
    expect(SearchQuery.parse("   ")).toBeNull();
    expect(SearchQuery.parse("ab")).not.toBeNull();
  });

  it("caps the query at 100 characters", () => {
    expect(parse("x".repeat(300)).value).toHaveLength(100);
  });

  it("makes LIKE wildcards and the escape character literal", () => {
    expect(parse("50%_\\x").likePattern()).toBe("%50\\%\\_\\\\x%");
  });

  it("matches in memory as ILIKE does: any case, wildcards literal, Thai without word breaks", () => {
    expect(parse("ROAD").matches("My roadmap")).toBe(true);
    expect(parse("100%").matches("growth 100% of 1000")).toBe(true);
    expect(parse("10%0").matches("growth 100% of 1000")).toBe(false);
    expect(parse("a_c").matches("a_c")).toBe(true);
    expect(parse("a_c").matches("abc")).toBe(false);
    expect(parse("ชาวโลก").matches("สวัสดีชาวโลก")).toBe(true);
  });

  it("windows the snippet around the match", () => {
    const text = `${"a".repeat(100)} needle ${"b".repeat(100)}`;
    const snippet = parse("NEEDLE").snippet(text);
    expect(snippet.startsWith("…")).toBe(true);
    expect(snippet.endsWith("…")).toBe(true);
    expect(snippet).toContain("needle");
    expect(snippet.length).toBeLessThan(110);
  });

  it("keeps Thai text intact", () => {
    expect(parse("สวัสดี").snippet("ก\nสวัสดีชาวโลก")).toBe("ก สวัสดีชาวโลก");
  });
});
