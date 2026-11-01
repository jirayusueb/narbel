// Dense 24px comment controls keep their size; on touch an invisible ::after grows the hit area to 44px
// (the same idea as the page tabs' TOUCH in board-pages).
export const TOUCH_ICON =
  "relative pointer-coarse:after:absolute pointer-coarse:after:-inset-2.5";
export const TOUCH_ROW =
  "relative pointer-coarse:after:absolute pointer-coarse:after:-inset-y-2.5";
