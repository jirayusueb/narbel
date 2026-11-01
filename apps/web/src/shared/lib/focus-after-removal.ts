// A control whose row is about to disappear (revoke, restore, delete, remove) would drop keyboard focus onto
// <body>. Call this before the removal, then the returned function once the row is gone: focus moves to the
// same control in the next row, else the previous row, else the fallback (made focusable if it is a heading).
// A row is an <li>, or any element marked data-row (grid cards).
export const focusAfterRemoval = (control: Element, fallback: string) => {
  const row = control.closest("li, [data-row]");
  const own = control.closest("button, a");
  const index =
    row && own ? [...row.querySelectorAll("button, a")].indexOf(own) : -1;
  const sibling = row?.nextElementSibling ?? row?.previousElementSibling;
  const neighbour =
    index >= 0
      ? sibling?.querySelectorAll<HTMLElement>("button, a")[index]
      : undefined;
  return () => {
    const target = neighbour?.isConnected
      ? neighbour
      : document.querySelector<HTMLElement>(fallback);
    if (target && target.tabIndex < 0 && !target.hasAttribute("tabindex")) {
      target.setAttribute("tabindex", "-1");
    }
    target?.focus();
  };
};
