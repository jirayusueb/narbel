interface Size {
  width: number;
  height: number;
}

interface Point {
  left: number;
  top: number;
}

const MARGIN = 12;

/**
 * Keeps a popover anchored at `anchor` inside `bounds`: pushed left until it fits,
 * flipped above the anchor when it would pass the bottom, never past the margin.
 * `gap` is the space between the anchor and the popover; `anchorHeight` is how far the anchor extends above its point.
 */
export const placePopover = ({
  anchor,
  bounds,
  size,
  gap = 14,
  anchorHeight = 0,
}: {
  anchor: Point;
  bounds: Size;
  size: Size;
  gap?: number;
  anchorHeight?: number;
}): Point => {
  const left = Math.max(
    MARGIN,
    Math.min(anchor.left + gap, bounds.width - size.width - MARGIN)
  );
  const below = anchor.top;
  const top =
    below + size.height + MARGIN > bounds.height
      ? anchor.top - anchorHeight - gap - size.height
      : below;
  return { left, top: Math.max(MARGIN, top) };
};
