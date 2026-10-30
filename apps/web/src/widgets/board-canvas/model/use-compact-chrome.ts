import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

import { nextCompact, topRowSlack } from "./chrome-fit";

// Mirror board-identity.tsx: the desktop card's left offset and its title cap (max-w-72).
const CARD_LEFT = 68;
const TITLE_CAP = 288;
// A live status is only a dot (label sr-only) in the compact card; the desktop card also shows "Live".
const LIVE_LABEL = 32;
const TOP_RIGHT_INSET = 12;

// True when the name card or the actions would collide with Excalidraw's centred toolbar, so they take a
// second row. Measures real boxes instead of a viewport breakpoint: the cluster grows with peers and the title.
export const useCompactChrome = ({
  canvasRef,
  enabled,
  card,
  cluster,
  liveStatus,
}: {
  canvasRef: RefObject<HTMLElement | null>;
  enabled: boolean;
  card: HTMLElement | null;
  cluster: HTMLElement | null;
  liveStatus: boolean;
}) => {
  const [compact, setCompact] = useState(false);
  // Compact mode empties Excalidraw's top-right slot, which re-centres the toolbar. Measured from there the
  // way back always looks free and the two layouts flip each other until React aborts, so the exit check
  // shifts the toolbar back by the move seen on the last switch.
  const wideToolbarLeft = useRef<number | null>(null);
  const toolbarShift = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    const title = card?.querySelector("h1");
    if (!(enabled && canvas && card && cluster && title)) {
      return;
    }
    const measure = () => {
      const toolbar = canvas.querySelector(".App-toolbar");
      if (!toolbar) {
        setCompact(false);
        return;
      }
      const bar = toolbar.getBoundingClientRect();
      const slot = canvas.querySelector(".layer-ui__wrapper__top-right");
      const right =
        slot?.getBoundingClientRect().right ??
        canvas.getBoundingClientRect().right - TOP_RIGHT_INSET;
      const titleText = title.firstElementChild;
      const natural = Math.min(titleText?.scrollWidth ?? 0, TITLE_CAP);
      const chrome = card.offsetWidth - title.offsetWidth;
      const isCompactCard = card.dataset.compact === "true";
      if (!isCompactCard) {
        wideToolbarLeft.current = bar.left;
      } else if (wideToolbarLeft.current !== null) {
        toolbarShift.current = bar.left - wideToolbarLeft.current;
        wideToolbarLeft.current = null;
      }
      const shift = isCompactCard ? toolbarShift.current : 0;
      const slack = topRowSlack({
        cardLeft: canvas.getBoundingClientRect().left + CARD_LEFT,
        cardNeeded:
          chrome + natural + (isCompactCard && liveStatus ? LIVE_LABEL : 0),
        toolbarLeft: bar.left - shift,
        toolbarRight: bar.right - shift,
        clusterLeft: right - cluster.scrollWidth,
      });
      setCompact((was) => nextCompact(was, slack));
    };
    const observer = new ResizeObserver(measure);
    for (const el of [
      canvas,
      card,
      cluster,
      canvas.querySelector(".App-toolbar"),
      canvas.querySelector(".layer-ui__wrapper__top-right"),
    ]) {
      if (el) {
        observer.observe(el);
      }
    }
    measure();
    return () => observer.disconnect();
  }, [canvasRef, enabled, card, cluster, liveStatus]);

  return compact;
};
