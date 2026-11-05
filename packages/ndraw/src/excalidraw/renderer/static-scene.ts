import { FRAME_STYLE } from "../constants";
import { getElementAbsoluteCoords } from "../element";

import {
  elementOverlapsWithFrame,
  getTargetFrame,
  shouldApplyFrameClip,
} from "../frame";
import {
  isEmbeddableElement,
  isFrameLikeElement,
  isIframeLikeElement,
  isTextElement,
} from "../element/type-checks";
import { lodScaleOf, renderElement } from "./render-element";
import Scene from "../scene/scene";
import {
  getTileBudget,
  tileCache,
  tileKey,
  TILE,
  TILE_MIN_ELEMENTS,
} from "./tiles";
import { createPlaceholderEmbeddableLabel } from "../element/embeddable";
import type { StaticCanvasAppState, Zoom } from "../types";
import type {
  ElementsMap,
  ExcalidrawElement,
  ExcalidrawFrameLikeElement,
  NonDeletedExcalidrawElement,
} from "../element/types";
import type {
  StaticCanvasRenderConfig,
  StaticSceneRenderConfig,
} from "../scene/types";
import {
  EXTERNAL_LINK_IMG,
  ELEMENT_LINK_IMG,
  getLinkHandleFromCoords,
} from "../components/hyperlink/helpers";
import { bootstrapCanvas, getNormalizedCanvasDimensions } from "./helpers";
import { throttleRAF } from "../utils";
import { getBoundTextElement } from "../element/text-element";
import { isElementLink } from "../element/element-link";
import { perf } from "../perf/performance-manager";

// shortcut: 4 fresh tile rasters per frame; raise if tiles pop during fast pans
const MAX_FRESH_TILES_PER_FRAME = 4;
const GridLineColor = {
  Bold: "#dddddd",
  Regular: "#e5e5e5",
} as const;

const strokeGrid = (
  context: CanvasRenderingContext2D,
  /** grid cell pixel size */
  gridSize: number,
  /** setting to 1 will disble bold lines */
  gridStep: number,
  scrollX: number,
  scrollY: number,
  zoom: Zoom,
  width: number,
  height: number,
) => {
  const offsetX = (scrollX % gridSize) - gridSize;
  const offsetY = (scrollY % gridSize) - gridSize;

  const actualGridSize = gridSize * zoom.value;

  const spaceWidth = 1 / zoom.value;

  context.save();

  // Offset rendering by 0.5 to ensure that 1px wide lines are crisp.
  // We only do this when zoomed to 100% because otherwise the offset is
  // fractional, and also visibly offsets the elements.
  // We also do this per-axis, as each axis may already be offset by 0.5.
  if (zoom.value === 1) {
    context.translate(offsetX % 1 ? 0 : 0.5, offsetY % 1 ? 0 : 0.5);
  }

  // vertical lines
  for (let x = offsetX; x < offsetX + width + gridSize * 2; x += gridSize) {
    const isBold =
      gridStep > 1 && Math.round(x - scrollX) % (gridStep * gridSize) === 0;
    // don't render regular lines when zoomed out and they're barely visible
    if (!isBold && actualGridSize < 10) {
      continue;
    }

    const lineWidth = Math.min(1 / zoom.value, isBold ? 4 : 1);
    context.lineWidth = lineWidth;
    const lineDash = [lineWidth * 3, spaceWidth + (lineWidth + spaceWidth)];

    context.beginPath();
    context.setLineDash(isBold ? [] : lineDash);
    context.strokeStyle = isBold ? GridLineColor.Bold : GridLineColor.Regular;
    context.moveTo(x, offsetY - gridSize);
    context.lineTo(x, Math.ceil(offsetY + height + gridSize * 2));
    context.stroke();
  }

  for (let y = offsetY; y < offsetY + height + gridSize * 2; y += gridSize) {
    const isBold =
      gridStep > 1 && Math.round(y - scrollY) % (gridStep * gridSize) === 0;
    if (!isBold && actualGridSize < 10) {
      continue;
    }

    const lineWidth = Math.min(1 / zoom.value, isBold ? 4 : 1);
    context.lineWidth = lineWidth;
    const lineDash = [lineWidth * 3, spaceWidth + (lineWidth + spaceWidth)];

    context.beginPath();
    context.setLineDash(isBold ? [] : lineDash);
    context.strokeStyle = isBold ? GridLineColor.Bold : GridLineColor.Regular;
    context.moveTo(offsetX - gridSize, y);
    context.lineTo(Math.ceil(offsetX + width + gridSize * 2), y);
    context.stroke();
  }
  context.restore();
};

const frameClip = (
  frame: ExcalidrawFrameLikeElement,
  context: CanvasRenderingContext2D,
  renderConfig: StaticCanvasRenderConfig,
  appState: StaticCanvasAppState,
) => {
  context.translate(frame.x + appState.scrollX, frame.y + appState.scrollY);
  context.beginPath();
  if (context.roundRect) {
    context.roundRect(
      0,
      0,
      frame.width,
      frame.height,
      FRAME_STYLE.radius / appState.zoom.value,
    );
  } else {
    context.rect(0, 0, frame.width, frame.height);
  }
  context.clip();
  context.translate(
    -(frame.x + appState.scrollX),
    -(frame.y + appState.scrollY),
  );
};

type LinkIconCanvas = HTMLCanvasElement & { zoom: number };

const linkIconCanvasCache: {
  regularLink: LinkIconCanvas | null;
  elementLink: LinkIconCanvas | null;
} = {
  regularLink: null,
  elementLink: null,
};

const renderLinkIcon = (
  element: NonDeletedExcalidrawElement,
  context: CanvasRenderingContext2D,
  appState: StaticCanvasAppState,
  elementsMap: ElementsMap,
) => {
  if (element.link && !appState.selectedElementIds[element.id]) {
    const [x1, y1, x2, y2] = getElementAbsoluteCoords(element, elementsMap);
    const [x, y, width, height] = getLinkHandleFromCoords(
      [x1, y1, x2, y2],
      element.angle,
      appState,
    );
    const centerX = x + width / 2;
    const centerY = y + height / 2;
    context.save();
    context.translate(appState.scrollX + centerX, appState.scrollY + centerY);
    context.rotate(element.angle);

    const canvasKey = isElementLink(element.link)
      ? "elementLink"
      : "regularLink";

    let linkCanvas = linkIconCanvasCache[canvasKey];

    if (!linkCanvas || linkCanvas.zoom !== appState.zoom.value) {
      linkCanvas = Object.assign(document.createElement("canvas"), {
        zoom: appState.zoom.value,
      });
      linkCanvas.width = width * window.devicePixelRatio * appState.zoom.value;
      linkCanvas.height =
        height * window.devicePixelRatio * appState.zoom.value;
      linkIconCanvasCache[canvasKey] = linkCanvas;

      const linkCanvasCacheContext = linkCanvas.getContext("2d")!;
      linkCanvasCacheContext.scale(
        window.devicePixelRatio * appState.zoom.value,
        window.devicePixelRatio * appState.zoom.value,
      );
      linkCanvasCacheContext.fillStyle = "#fff";
      linkCanvasCacheContext.fillRect(0, 0, width, height);

      if (canvasKey === "elementLink") {
        linkCanvasCacheContext.drawImage(ELEMENT_LINK_IMG, 0, 0, width, height);
      } else {
        linkCanvasCacheContext.drawImage(
          EXTERNAL_LINK_IMG,
          0,
          0,
          width,
          height,
        );
      }

      linkCanvasCacheContext.restore();
    }
    context.drawImage(linkCanvas, x - centerX, y - centerY, width, height);
    context.restore();
  }
};
const _renderStaticScene = ({
  canvas,
  rc,
  elementsMap,
  allElementsMap,
  visibleElements,
  scale,
  appState,
  renderConfig,
}: StaticSceneRenderConfig) => {
  if (canvas === null) {
    return;
  }

  const { renderGrid = true, isExporting } = renderConfig;

  const [normalizedWidth, normalizedHeight] = getNormalizedCanvasDimensions(
    canvas,
    scale,
  );

  const context = bootstrapCanvas({
    canvas,
    scale,
    normalizedWidth,
    normalizedHeight,
    theme: appState.theme,
    isExporting,
    viewBackgroundColor: appState.viewBackgroundColor,
  });

  // Apply zoom
  context.scale(appState.zoom.value, appState.zoom.value);

  // Grid
  if (renderGrid) {
    strokeGrid(
      context,
      appState.gridSize,
      appState.gridStep,
      appState.scrollX,
      appState.scrollY,
      appState.zoom,
      normalizedWidth / appState.zoom.value,
      normalizedHeight / appState.zoom.value,
    );
  }

  const groupsToBeAddedToFrame = new Set<string>();

  visibleElements.forEach((element) => {
    if (
      element.groupIds.length > 0 &&
      appState.frameToHighlight &&
      appState.selectedElementIds[element.id] &&
      (elementOverlapsWithFrame(
        element,
        appState.frameToHighlight,
        elementsMap,
      ) ||
        element.groupIds.find((groupId) => groupsToBeAddedToFrame.has(groupId)))
    ) {
      element.groupIds.forEach((groupId) =>
        groupsToBeAddedToFrame.add(groupId),
      );
    }
  });

  const inFrameGroupsMap = new Map<string, boolean>();

  // shared per-element paint (direct pass, overflow fallback and tile
  // rasterization; tile passes give a derived appState/scroll offset)
  const paintElements = (
    elements: readonly ExcalidrawElement[],
    context: CanvasRenderingContext2D,
    state: StaticCanvasAppState,
    drawLinkIcons: boolean,
  ) => {
    elements.forEach((element) => {
      try {
        const frameId = element.frameId || state.frameToHighlight?.id;

        if (
          isTextElement(element) &&
          element.containerId &&
          elementsMap.has(element.containerId)
        ) {
          // will be rendered with the container
          return;
        }

        context.save();

        if (
          frameId &&
          state.frameRendering.enabled &&
          state.frameRendering.clip
        ) {
          const frame = getTargetFrame(element, elementsMap, state);
          if (
            frame &&
            shouldApplyFrameClip(
              element,
              frame,
              state,
              elementsMap,
              inFrameGroupsMap,
            )
          ) {
            frameClip(frame, context, renderConfig, state);
          }
          renderElement(
            element,
            elementsMap,
            allElementsMap,
            rc,
            context,
            renderConfig,
            state,
          );
        } else {
          renderElement(
            element,
            elementsMap,
            allElementsMap,
            rc,
            context,
            renderConfig,
            state,
          );
        }

        const boundTextElement = getBoundTextElement(element, elementsMap);
        if (boundTextElement) {
          renderElement(
            boundTextElement,
            elementsMap,
            allElementsMap,
            rc,
            context,
            renderConfig,
            state,
          );
        }

        context.restore();

        if (!isExporting && drawLinkIcons) {
          renderLinkIcon(element, context, state, elementsMap);
        }
      } catch (error: unknown) {
        console.error(
          error,
          element.id,
          element.x,
          element.y,
          element.width,
          element.height,
        );
      }
    });
  };

  const tileMode =
    !isExporting &&
    getTileBudget() > 0 &&
    visibleElements.length >= TILE_MIN_ELEMENTS;

  if (tileMode) {
    // Tile compositing: each 512px tile (at its own level) is rasterized once
    // through the same paintElements path with a scroll/zoom-derived appState,
    // then blitted per frame until a scene diff invalidates it.
    const zoomValue = appState.zoom.value;
    const level = lodScaleOf(zoomValue);
    const tileSceneSize = TILE / level;
    const scene = Scene.getScene(visibleElements[0]);
    const index = scene ? scene.spatialIndex : null;
    // elements never baked into tiles: not renderable right now, iframe-like,
    // selected (must redraw immediately while interacted with), or frame-like
    // (borders/names stay crisp on the main canvas)
    const isTileable = (element: ExcalidrawElement) =>
      elementsMap.has(element.id) &&
      !isIframeLikeElement(element) &&
      !isFrameLikeElement(element) &&
      !appState.selectedElementIds[element.id];

    const left = -appState.scrollX;
    const top = -appState.scrollY;
    const tx0 = Math.floor(left / tileSceneSize);
    const ty0 = Math.floor(top / tileSceneSize);
    const tx1 = Math.floor((left + appState.width / zoomValue) / tileSceneSize);
    const ty1 = Math.floor((top + appState.height / zoomValue) / tileSceneSize);

    const overflow: ExcalidrawElement[] = [];
    let freshTiles = 0;

    if (index) {
      for (let ty = ty0; ty <= ty1; ty++) {
        for (let tx = tx0; tx <= tx1; tx++) {
          const key = tileKey(level, tx, ty);
          const cached = tileCache.get(key);
          if (cached) {
            context.drawImage(
              cached.canvas,
              tx * tileSceneSize,
              ty * tileSceneSize,
              tileSceneSize,
              tileSceneSize,
            );
            perf.count("tileComposite");
            continue;
          }
          const tileRect = {
            x1: tx * tileSceneSize,
            y1: ty * tileSceneSize,
            x2: (tx + 1) * tileSceneSize,
            y2: (ty + 1) * tileSceneSize,
          };
          if (freshTiles >= MAX_FRESH_TILES_PER_FRAME) {
            // over budget: draw this tile's elements directly this frame
            for (const element of index.search(tileRect, 0)) {
              if (isTileable(element)) {
                overflow.push(element);
              }
            }
            continue;
          }
          freshTiles++;
          const tileCanvas = document.createElement("canvas");
          tileCanvas.width = tileCanvas.height = Math.round(TILE * scale);
          const tileContext = tileCanvas.getContext("2d")!;
          tileContext.scale(scale * level, scale * level);
          const tileAppState = {
            ...appState,
            zoom: { value: level },
            scrollX: -tileRect.x1,
            scrollY: -tileRect.y1,
          };
          const tileElements: ExcalidrawElement[] = [];
          for (const element of index.search(tileRect, 0)) {
            if (isTileable(element)) {
              tileElements.push(element);
            }
          }
          paintElements(tileElements, tileContext, tileAppState, false);
          tileCache.put(key, tileCanvas, level, tx, ty);
          context.drawImage(
            tileCanvas,
            tileRect.x1,
            tileRect.y1,
            tileSceneSize,
            tileSceneSize,
          );
          perf.count("tileComposite");
        }
      }
    }

    // direct draws above the tiles: selected + frame-like + over-budget tiles
    paintElements(
      visibleElements.filter(
        (element) =>
          !isIframeLikeElement(element) &&
          (appState.selectedElementIds[element.id] || isFrameLikeElement(element)),
      ),
      context,
      appState,
      true,
    );
    paintElements(overflow, context, appState, false);
    // link icons of tile-resident elements stay on the main canvas
    if (!isExporting) {
      for (const element of visibleElements) {
        if (
          !isIframeLikeElement(element) &&
          !appState.selectedElementIds[element.id] &&
          !(
            isTextElement(element) &&
            element.containerId &&
            elementsMap.has(element.containerId)
          )
        ) {
          renderLinkIcon(element, context, appState, elementsMap);
        }
      }
    }
  } else {
    // Paint visible elements
    paintElements(
      visibleElements.filter((el) => !isIframeLikeElement(el)),
      context,
      appState,
      true,
    );
  }

  // render embeddables on top
  visibleElements
    .filter((el) => isIframeLikeElement(el))
    .forEach((element) => {
      try {
        const render = () => {
          renderElement(
            element,
            elementsMap,
            allElementsMap,
            rc,
            context,
            renderConfig,
            appState,
          );

          if (
            isIframeLikeElement(element) &&
            (isExporting ||
              (isEmbeddableElement(element) &&
                renderConfig.embedsValidationStatus.get(element.id) !==
                  true)) &&
            element.width &&
            element.height
          ) {
            const label = createPlaceholderEmbeddableLabel(element);
            renderElement(
              label,
              elementsMap,
              allElementsMap,
              rc,
              context,
              renderConfig,
              appState,
            );
          }
          if (!isExporting) {
            renderLinkIcon(element, context, appState, elementsMap);
          }
        };
        // - when exporting the whole canvas, we DO NOT apply clipping
        // - when we are exporting a particular frame, apply clipping
        //   if the containing frame is not selected, apply clipping
        const frameId = element.frameId || appState.frameToHighlight?.id;

        if (
          frameId &&
          appState.frameRendering.enabled &&
          appState.frameRendering.clip
        ) {
          context.save();

          const frame = getTargetFrame(element, elementsMap, appState);

          if (
            frame &&
            shouldApplyFrameClip(
              element,
              frame,
              appState,
              elementsMap,
              inFrameGroupsMap,
            )
          ) {
            frameClip(frame, context, renderConfig, appState);
          }
          render();
          context.restore();
        } else {
          render();
        }
      } catch (error: any) {
        console.error(error);
      }
    });

  // render pending nodes for flowcharts
  renderConfig.pendingFlowchartNodes?.forEach((element) => {
    try {
      renderElement(
        element,
        elementsMap,
        allElementsMap,
        rc,
        context,
        renderConfig,
        appState,
      );
    } catch (error) {
      console.error(error);
    }
  });
};

const renderStaticSceneTimed = (config: StaticSceneRenderConfig) => {
  const startedAt = perf.start();
  _renderStaticScene(config);
  perf.end("staticRender", startedAt);
};

/** throttled to animation framerate */
export const renderStaticSceneThrottled = throttleRAF(
  (config: StaticSceneRenderConfig) => {
    renderStaticSceneTimed(config);
  },
  { trailing: true },
);

/**
 * Static scene is the non-ui canvas where we render elements.
 */
export const renderStaticScene = (
  renderConfig: StaticSceneRenderConfig,
  throttle?: boolean,
) => {
  if (throttle) {
    renderStaticSceneThrottled(renderConfig);
    return;
  }

  renderStaticSceneTimed(renderConfig);
};
