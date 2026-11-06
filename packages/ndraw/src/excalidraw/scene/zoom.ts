import type { AppState, NormalizedZoomValue } from "../types";

export const getStateForZoom = (
  {
    viewportX,
    viewportY,
    nextZoom,
  }: {
    viewportX: number;
    viewportY: number;
    nextZoom: NormalizedZoomValue;
  },
  appState: AppState,
) => {
  const appLayerX = viewportX - appState.offsetLeft;
  const appLayerY = viewportY - appState.offsetTop;

  const currentZoom = appState.zoom.value;

  // get original scroll position without zoom
  const baseScrollX = appState.scrollX + (appLayerX - appLayerX / currentZoom);
  const baseScrollY = appState.scrollY + (appLayerY - appLayerY / currentZoom);

  // get scroll offsets for target zoom level
  const zoomOffsetScrollX = -(appLayerX - appLayerX / nextZoom);
  const zoomOffsetScrollY = -(appLayerY - appLayerY / nextZoom);

  return {
    scrollX: baseScrollX + zoomOffsetScrollX,
    scrollY: baseScrollY + zoomOffsetScrollY,
    zoom: {
      value: nextZoom,
    },
  };
};

export const interpolateCamera = (
  from: { scrollX: number; scrollY: number; zoom: number },
  to: { scrollX: number; scrollY: number; zoom: number },
  t: number,
) => ({
  scrollX: from.scrollX + (to.scrollX - from.scrollX) * t,
  scrollY: from.scrollY + (to.scrollY - from.scrollY) * t,
  // zoom interpolates in log space so multipliers feel linear at any scale
  zoom: Math.exp(
    Math.log(from.zoom) + (Math.log(to.zoom) - Math.log(from.zoom)) * t,
  ),
});
