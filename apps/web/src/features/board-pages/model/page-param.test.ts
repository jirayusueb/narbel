import { describe, expect, it } from "bun:test";

import { pageIdFromParam, pageParamOf } from "./page-param";

describe("page param", () => {
  it.each(["page:main", "page:3f2c9a1e-8b7d-4c11-9a52-0d6e5b1f7a90"])(
    "round-trips %s",
    (id) => {
      expect(pageParamOf(id).startsWith("page:")).toBe(false);
      expect(pageIdFromParam(pageParamOf(id))).toBe(id);
    }
  );

  it("accepts a full page id", () => {
    expect(pageIdFromParam("page:main")).toBe("page:main");
  });

  it("treats empty or missing as no page", () => {
    const missing: string | undefined = [][0];
    expect(pageIdFromParam(missing)).toBeNull();
    expect(pageIdFromParam("")).toBeNull();
  });
});
