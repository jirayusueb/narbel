import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { useResizeObserver } from "@reactuses/core";
import { useEffect, useRef } from "react";
import type { RefObject } from "react";

import { isPhoneSize } from "./chrome-fit";

// Excalidraw's ResizeObserver updates its phone/desktop flag without re-rendering, so a live resize across the
// breakpoint left the old layout (no page tabs or zoom) until some other update. This observer runs after its
// own (created later); refresh() re-renders, and only when the flag flips so window drags don't redraw.
export const usePhoneRefresh = (
  canvasRef: RefObject<HTMLElement | null>,
  api: ExcalidrawImperativeAPI | null
) => {
  const wasPhone = useRef(false);
  useEffect(() => {
    const el = canvasRef.current;
    if (api && el) {
      wasPhone.current = isPhoneSize(el.clientWidth, el.clientHeight);
    }
  }, [canvasRef, api]);
  // The observer exists only while there is an api; it is created with that api, which never changes once set.
  useResizeObserver(api ? canvasRef : null, ([entry]) => {
    const { width, height } = entry.contentRect;
    const phone = isPhoneSize(width, height);
    if (phone !== wasPhone.current) {
      wasPhone.current = phone;
      api?.refresh();
    }
  });
};
