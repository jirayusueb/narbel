import { describe, expect, it } from "bun:test";

import { isPhoneSize, nextCompact, topRowSlack } from "./chrome-fit";

const box = {
  cardLeft: 68,
  cardNeeded: 300,
  toolbarLeft: 400,
  toolbarRight: 800,
  clusterLeft: 900,
};

describe("topRowSlack", () => {
  it("is the tighter side", () => {
    expect(topRowSlack(box)).toBe(32);
    expect(topRowSlack({ ...box, clusterLeft: 790 })).toBe(-10);
  });
});

describe("nextCompact", () => {
  it("goes compact below the gap", () => {
    expect(nextCompact(false, 7)).toBe(true);
    expect(nextCompact(false, 8)).toBe(false);
  });
  it("needs extra room to leave compact", () => {
    expect(nextCompact(true, 31)).toBe(true);
    expect(nextCompact(true, 32)).toBe(false);
  });
});

describe("isPhoneSize", () => {
  it("matches Excalidraw's breakpoint", () => {
    expect(isPhoneSize(729, 900)).toBe(true);
    expect(isPhoneSize(730, 900)).toBe(false);
    expect(isPhoneSize(900, 499)).toBe(true);
    expect(isPhoneSize(1000, 499)).toBe(false);
  });
});
