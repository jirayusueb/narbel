import { expect, test } from "bun:test";

import { takeReveal } from "./agent-focus";

const agents = new Set(["7"]);
const focus = (reveal: unknown, extra: object = {}) => ({
  mcp: true,
  pageId: "p1",
  selection: ["a", "b"],
  reveal,
  ...extra,
});

test("a reveal present on join is absorbed once and never fires", () => {
  const seen = new Map<number, number>();
  const states = new Map([[7, focus(3)]]);
  expect(takeReveal(states, seen, agents)).toBeDefined();
  expect(takeReveal(states, seen, agents)).toBeUndefined();
});

test("each new reveal number yields exactly one reveal", () => {
  const seen = new Map<number, number>();
  takeReveal(new Map([[7, focus(1)]]), seen, agents);
  expect(takeReveal(new Map([[7, focus(2)]]), seen, agents)).toEqual({
    clientId: 7,
    pageId: "p1",
    ids: ["a", "b"],
  });
  expect(takeReveal(new Map([[7, focus(2)]]), seen, agents)).toBeUndefined();
});

test("a client outside the agents map cannot trigger a reveal", () => {
  const seen = new Map<number, number>();
  expect(takeReveal(new Map([[9, focus(1)]]), seen, agents)).toBeUndefined();
  expect(
    takeReveal(new Map([[9, focus(1)]]), new Map(), new Set(["9"]))
  ).toBeDefined();
});

test("malformed states are ignored", () => {
  const seen = new Map<number, number>();
  const bad = [
    focus("1"),
    focus(Number.NaN),
    focus(1, { pageId: 4 }),
    focus(1, { selection: "a" }),
    focus(1, { selection: ["a", 2] }),
    { mcp: true },
  ];
  for (const state of bad) {
    expect(takeReveal(new Map([[7, state]]), seen, agents)).toBeUndefined();
  }
});
