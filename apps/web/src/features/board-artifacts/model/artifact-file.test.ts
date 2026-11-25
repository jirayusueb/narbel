import { describe, expect, it } from "bun:test";

import { artifactFileOf } from "./artifact-file";

describe("artifactFileOf", () => {
  it("maps html and markdown extensions, case-insensitively", () => {
    expect(artifactFileOf({ name: "a.html" })).toEqual({
      name: "a.html",
      format: "html",
    });
    expect(artifactFileOf({ name: "a.HTM" })?.format).toBe("html");
    expect(artifactFileOf({ name: "notes.md" })?.format).toBe("markdown");
    expect(artifactFileOf({ name: "n.markdown" })?.format).toBe("markdown");
  });
  it("rejects other files", () => {
    expect(artifactFileOf({ name: "a.png" })).toBeNull();
    expect(artifactFileOf({ name: "html" })).toBeNull();
  });
});
