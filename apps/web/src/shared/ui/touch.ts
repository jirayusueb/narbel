// Dense controls (24-32px) keep their size; on touch an invisible ::after grows the hit area to at least 44px
// (the same idea as the page tabs' TOUCH in board-pages).
export const TOUCH_ICON =
  "relative pointer-coarse:after:absolute pointer-coarse:after:-inset-2.5";
export const TOUCH_ROW =
  "relative pointer-coarse:after:absolute pointer-coarse:after:-inset-y-2.5";
