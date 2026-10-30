import { useMediaQuery } from "@reactuses/core";
import { useEffect, useEffectEvent, useRef } from "react";

// Below md the comments panel covers the whole board, so it behaves as a modal sheet there.
const COVERS_QUERY = "(max-width: 767px)";
const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), [contenteditable="true"], [tabindex]:not([tabindex="-1"])';
const SHEET_PROPS = {
  role: "dialog",
  "aria-modal": true,
  "aria-label": "Comments",
} as const;

const isEditable = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    /^(?:input|textarea|select)$/iu.test(target.tagName));

// Keeps Tab inside the panel while it covers the board.
const wrapTab = (panel: HTMLElement, e: KeyboardEvent) => {
  const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)];
  const [first] = items;
  const last = items.at(-1);
  const active = document.activeElement;
  if (e.shiftKey && (active === first || active === panel)) {
    e.preventDefault();
    last?.focus();
  } else if (!e.shiftKey && active === last) {
    e.preventDefault();
    first?.focus();
  }
};

/**
 * Keyboard behaviour of the comments panel: opening moves focus into it, Escape closes it,
 * closing hands focus back to whatever opened it, and on small screens it is a modal sheet.
 */
export const useCommentsSheet = (open: boolean, close: () => void) => {
  const covers = useMediaQuery(COVERS_QUERY, false);
  const panelRef = useRef<HTMLElement>(null);
  const onKeyDown = useEffectEvent((e: KeyboardEvent) => {
    const panel = panelRef.current;
    if (e.key === "Escape" && !e.defaultPrevented && !isEditable(e.target)) {
      // Claimed here so the board's own Escape (draft, selection, mode) leaves the step to the panel.
      e.preventDefault();
      close();
    } else if (e.key === "Tab" && covers && panel) {
      wrapTab(panel, e);
    }
  });

  useEffect(() => {
    const panel = panelRef.current;
    if (!(open && panel)) {
      return;
    }
    const back = document.activeElement as HTMLElement | null;
    panel.focus({ preventScroll: true });
    const listener = (e: KeyboardEvent) => onKeyDown(e);
    panel.addEventListener("keydown", listener);
    return () => {
      panel.removeEventListener("keydown", listener);
      // The panel is gone by now; only reclaim focus it dropped, never focus the user moved elsewhere.
      if (document.activeElement === document.body) {
        back?.focus({ preventScroll: true });
      }
    };
  }, [open]);

  return { panelRef, sheetProps: covers ? SHEET_PROPS : undefined };
};
