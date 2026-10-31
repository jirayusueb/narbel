interface ShortcutTarget {
  closest?: (selector: string) => unknown;
  isContentEditable?: boolean;
  tagName?: string;
}

export interface ShortcutKeyEvent {
  altKey: boolean;
  code: string;
  isComposing?: boolean;
  key: string;
  shiftKey: boolean;
  target: unknown;
}

const EDITABLE_TAGS: Record<string, true> = {
  INPUT: true,
  SELECT: true,
  TEXTAREA: true,
};
const DIALOG_SELECTOR =
  'dialog,[role="dialog"],[role="alertdialog"],[aria-modal="true"],.Modal';
const LETTER_CODE = /^Key(?<letter>[A-Z])$/u;
const DIGIT_CODE = /^Digit(?<digit>[0-9])$/u;
const THAI_BLOCK = /^[\u0E00-\u0E7F]$/u;

const blocked = (target: unknown): boolean => {
  const el = target as ShortcutTarget | null;
  if (!el) {
    return false;
  }
  return (
    el.isContentEditable === true ||
    (el.tagName !== undefined && EDITABLE_TAGS[el.tagName] === true) ||
    Boolean(el.closest?.(DIALOG_SELECTOR))
  );
};

/** Latin `key` for a non-Latin layout's physical key, or null to leave the event alone. */
export const latinShortcutKey = (e: ShortcutKeyEvent): string | null => {
  if (e.altKey || e.isComposing || e.key === "Process" || blocked(e.target)) {
    return null;
  }
  const letter = LETTER_CODE.exec(e.code)?.groups?.letter;
  // Only non-Latin letters; AZERTY/QWERTZ already report a Latin letter.
  if (letter && /^\p{L}$/u.test(e.key) && !/^[A-Za-z]$/u.test(e.key)) {
    return e.shiftKey ? letter : letter.toLowerCase();
  }
  const digit = DIGIT_CODE.exec(e.code)?.groups?.digit;
  if (!digit) {
    return null;
  }
  // Thai Kedmanee puts Thai characters on the digit row, except unshifted 2 and 3 ('/' and '-').
  const thaiPunct =
    !e.shiftKey &&
    ((e.code === "Digit2" && e.key === "/") ||
      (e.code === "Digit3" && e.key === "-"));
  return THAI_BLOCK.test(e.key) || thaiPunct ? digit : null;
};

/** Capture-phase shadowing of `key` on the original event so Excalidraw's document handler sees Latin keys. */
const onKeyDown = (e: KeyboardEvent) => {
  const key = latinShortcutKey(e);
  if (key) {
    Object.defineProperty(e, "key", { value: key, configurable: true });
  }
};

export const installLatinShortcuts = (root: HTMLElement): (() => void) => {
  root.addEventListener("keydown", onKeyDown, true);
  return () => root.removeEventListener("keydown", onKeyDown, true);
};
