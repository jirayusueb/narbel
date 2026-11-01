import { describe, expect, it } from "bun:test";

import type { Element } from "../entities/element";
import { Groups } from "./groups";

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
    const grouped = Groups.withGroup(el("a", ["inner"]), "outer");
    expect(grouped.groupIds).toEqual(["inner", "outer"]);
    expect(Groups.outermostGroup(grouped)).toBe("outer");
  });

  it("reuses the group of exactly the same set, not of a subset or superset", () => {
    const page = [
      el("a", ["g"]),
      el("b", ["g"]),
      el("c", ["g"]),
      el("t", ["g"], { containerId: "a" }),
    ];
    expect(
      Groups.existingGroup([page[0], page[1], page[2]] as Element[], page)
    ).toBe("g");
    expect(
      Groups.existingGroup([page[0], page[1]] as Element[], page)
    ).toBeUndefined();
    expect(
      Groups.existingGroup([el("a", ["g"]), el("x")], page)
    ).toBeUndefined();
  });

  it("removes one group id and lists distinct outermost ids", () => {
    expect(Groups.withoutGroup(el("a", ["in", "out"]), "out").groupIds).toEqual(
      ["in"]
    );
    expect(
      Groups.outermostGroups([el("a", ["x", "g"]), el("b", ["g"]), el("c")])
    ).toEqual(["g"]);
  });
});
