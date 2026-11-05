import type { StaticCanvasAppState, AppState } from "../types";

import type { StaticCanvasRenderConfig } from "../scene/types";

import { THEME, THEME_FILTER } from "../constants";

/**
 * Canvas creation seam for the draw path. Defaults to `document.createElement`;
 * the tile worker installs an OffscreenCanvas factory. The return type stays
 * HTMLCanvasElement because every caller only needs the 2d-context surface
 * both canvas kinds share.
 */
type CanvasFactory = (width: number, height: number) => HTMLCanvasElement | OffscreenCanvas;
let canvasFactory: CanvasFactory | null = null;

export const setCanvasFactory = (factory: CanvasFactory | null) => {
  canvasFactory = factory;
};

export const createCanvas = (): HTMLCanvasElement =>
  (canvasFactory
    ? canvasFactory(1, 1)
    : document.createElement("canvas")) as HTMLCanvasElement;

export const fillCircle = (
  context: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  stroke = true,
) => {
  context.beginPath();
  context.arc(cx, cy, radius, 0, Math.PI * 2);
  context.fill();
  if (stroke) {
    context.stroke();
  }
};

export const getNormalizedCanvasDimensions = (
  canvas: HTMLCanvasElement,
  scale: number,
): [number, number] => {
  // When doing calculations based on canvas width we should used normalized one
  return [canvas.width / scale, canvas.height / scale];
};

export const bootstrapCanvas = ({
  canvas,
  scale,
  normalizedWidth,
  normalizedHeight,
  theme,
  isExporting,
  viewBackgroundColor,
}: {
  canvas: HTMLCanvasElement;
  scale: number;
  normalizedWidth: number;
  normalizedHeight: number;
  theme?: AppState["theme"];
  isExporting?: StaticCanvasRenderConfig["isExporting"];
  viewBackgroundColor?: StaticCanvasAppState["viewBackgroundColor"];
}): CanvasRenderingContext2D => {
  const context = canvas.getContext("2d")!;

  context.setTransform(1, 0, 0, 1, 0, 0);
  context.scale(scale, scale);

  if (isExporting && theme === THEME.DARK) {
    context.filter = THEME_FILTER;
  }

  // Paint background
  if (typeof viewBackgroundColor === "string") {
    const hasTransparence =
      viewBackgroundColor === "transparent" ||
      viewBackgroundColor.length === 5 || // #RGBA
      viewBackgroundColor.length === 9 || // #RRGGBBA
      /(hsla|rgba)\(/.test(viewBackgroundColor);
    if (hasTransparence) {
      context.clearRect(0, 0, normalizedWidth, normalizedHeight);
    }
    context.save();
    context.fillStyle = viewBackgroundColor;
    context.fillRect(0, 0, normalizedWidth, normalizedHeight);
    context.restore();
  } else {
    context.clearRect(0, 0, normalizedWidth, normalizedHeight);
  }

  return context;
};
