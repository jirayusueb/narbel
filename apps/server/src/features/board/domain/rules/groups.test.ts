import { describe, expect, it } from "bun:test";

import type { Element } from "../entities/Element";
import {
  existingGroup,
  outermostGroup,
  outermostGroups,
  withGroup,
  withoutGroup,
} from "./groups";

const el = (id: string, groupIds: string[] = [], extra = {}): Element => ({
  id,
  type: "rectangle",
  version: 1,
  versionNonce: 1,
  groupIds,
  rest: {},
  ...extra,
});

describe("groups", () => {
  it("appends the new group as the outermost", () => {
    const grouped = withGroup(el("a", ["inner"]), "outer");
    expect(grouped.groupIds).toEqual(["inner", "outer"]);
    expect(outermostGroup(grouped)).toBe("outer");
  });

  it("reuses the group of exactly the same set, not of a subset or superset", () => {
    const page = [
      el("a", ["g"]),
      el("b", ["g"]),
      el("c", ["g"]),
      el("t", ["g"], { containerId: "a" }),
    ];
    expect(existingGroup([page[0], page[1], page[2]] as Element[], page)).toBe(
      "g"
    );
    expect(
      existingGroup([page[0], page[1]] as Element[], page)
    ).toBeUndefined();
    expect(existingGroup([el("a", ["g"]), el("x")], page)).toBeUndefined();
  });

  it("removes one group id and lists distinct outermost ids", () => {
    expect(withoutGroup(el("a", ["in", "out"]), "out").groupIds).toEqual([
      "in",
    ]);
    expect(
      outermostGroups([el("a", ["x", "g"]), el("b", ["g"]), el("c")])
    ).toEqual(["g"]);
  });
});
