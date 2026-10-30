const GAP = 8;
// Once compact, the top row must clear by this much extra before we go back, so a resize can't flip it every frame.
const EXIT_EXTRA = 24;

interface TopRowBox {
  // Viewport x coordinates in px.
  cardLeft: number;
  cardNeeded: number;
  toolbarLeft: number;
  toolbarRight: number;
  clusterLeft: number;
}

// Room left on the tighter side of the centred toolbar; negative means overlap.
export const topRowSlack = (box: TopRowBox) =>
  Math.min(
    box.toolbarLeft - (box.cardLeft + box.cardNeeded),
    box.clusterLeft - box.toolbarRight
  );

export const nextCompact = (wasCompact: boolean, slack: number) =>
  slack < (wasCompact ? GAP + EXIT_EXTRA : GAP);

// Excalidraw's phone rule (isMobileBreakpoint) on a measured size.
export const isPhoneSize = (width: number, height: number) =>
  width < 730 || (height < 500 && width < 1000);
