import { expect, test } from "bun:test";

import { latinShortcutKey, onLatinShortcutKeyDown } from "./latin-shortcuts";
import type { ShortcutKeyEvent } from "./latin-shortcuts";

const ev = (over: Partial<ShortcutKeyEvent>): ShortcutKeyEvent => ({
  altKey: false,
  code: "KeyR",
  key: "r",
  shiftKey: false,
  target: { tagName: "DIV", closest: () => null },
  ...over,
});

test("Thai letter keys map to the physical Latin tool key", () => {
  expect(latinShortcutKey(ev({ code: "KeyR", key: "พ" }))).toBe("r");
  expect(latinShortcutKey(ev({ code: "KeyR", key: "ภ", shiftKey: true }))).toBe(
    "R"
  );
});

test("Thai digit row maps to tool digits", () => {
  expect(latinShortcutKey(ev({ code: "Digit1", key: "ๅ" }))).toBe("1");
  expect(latinShortcutKey(ev({ code: "Digit2", key: "/" }))).toBe("2");
  expect(latinShortcutKey(ev({ code: "Digit3", key: "-" }))).toBe("3");
  expect(latinShortcutKey(ev({ code: "Digit4", key: "ภ" }))).toBe("4");
});

test("Latin and other layouts are left alone", () => {
  expect(latinShortcutKey(ev({ code: "KeyR", key: "r" }))).toBeNull();
  expect(latinShortcutKey(ev({ code: "KeyA", key: "q" }))).toBeNull();
  expect(latinShortcutKey(ev({ code: "Digit1", key: "1" }))).toBeNull();
  expect(latinShortcutKey(ev({ code: "Digit2", key: "é" }))).toBeNull();
  expect(
    latinShortcutKey(ev({ code: "Digit2", key: "/", shiftKey: true }))
  ).toBeNull();
  expect(latinShortcutKey(ev({ code: "Digit1", key: "&" }))).toBeNull();
});

test("editable targets, dialogs, IME and Alt are skipped", () => {
  const thai = { code: "KeyR", key: "พ" };
  expect(
    latinShortcutKey(ev({ ...thai, target: { tagName: "TEXTAREA" } }))
  ).toBeNull();
  expect(
    latinShortcutKey(ev({ ...thai, target: { tagName: "INPUT" } }))
  ).toBeNull();
  expect(
    latinShortcutKey(ev({ ...thai, target: { isContentEditable: true } }))
  ).toBeNull();
  expect(
    latinShortcutKey(
      ev({ ...thai, target: { tagName: "BUTTON", closest: () => ({}) } })
    )
  ).toBeNull();
  expect(latinShortcutKey(ev({ ...thai, isComposing: true }))).toBeNull();
  expect(latinShortcutKey(ev({ ...thai, key: "Process" }))).toBeNull();
  expect(latinShortcutKey(ev({ ...thai, altKey: true }))).toBeNull();
});

test("the listener shadows key on the same event", () => {
  const event = {
    ...ev({ code: "KeyR", key: "พ" }),
  } as unknown as KeyboardEvent;
  onLatinShortcutKeyDown(event);
  expect(event.key).toBe("r");
});
