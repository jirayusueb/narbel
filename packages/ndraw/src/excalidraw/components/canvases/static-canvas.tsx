import React, { useEffect, useRef } from "react";
import type { RoughCanvas } from "roughjs/bin/canvas";
import { renderStaticScene } from "../../renderer/static-scene";
import { isShallowEqual } from "../../utils";
import type { AppState, StaticCanvasAppState } from "../../types";
import type { StaticCanvasRenderConfig } from "../../scene/types";
import type { NonDeletedSceneElementsMap } from "../../element/types";
import { isSameCamera } from "../../scene/renderer";
import type { Renderer, RendererCamera } from "../../scene/renderer";
import { isRenderThrottlingEnabled } from "../../react-utils";

type StaticCanvasProps = {
  canvas: HTMLCanvasElement;
  rc: RoughCanvas;
  renderer: Renderer;
  camera: RendererCamera;
  allElementsMap: NonDeletedSceneElementsMap;
  sceneNonce: number | undefined;
  selectionNonce: number | undefined;
  scale: number;
  appState: StaticCanvasAppState;
  renderConfig: StaticCanvasRenderConfig;
};

const StaticCanvas = (props: StaticCanvasProps) => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const isComponentMounted = useRef(false);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) {
      return;
    }

    const canvas = props.canvas;

    if (!isComponentMounted.current) {
      isComponentMounted.current = true;

      wrapper.replaceChildren(canvas);
      canvas.classList.add("excalidraw__canvas", "static");
    }

    const widthString = `${props.appState.width}px`;
    const heightString = `${props.appState.height}px`;
    if (canvas.style.width !== widthString) {
      canvas.style.width = widthString;
    }
    if (canvas.style.height !== heightString) {
      canvas.style.height = heightString;
    }

    const scaledWidth = props.appState.width * props.scale;
    const scaledHeight = props.appState.height * props.scale;
    // setting width/height resets the canvas even if dimensions not changed,
    // which would cause flicker when we skip frame (due to throttling)
    if (canvas.width !== scaledWidth) {
      canvas.width = scaledWidth;
    }
    if (canvas.height !== scaledHeight) {
      canvas.height = scaledHeight;
    }

    // the one place the camera reaches the renderer; the interactive canvas
    // reads the same memoized snapshot afterwards
    props.renderer.setCamera(props.camera);
    const { elementsMap, visibleElements } =
      props.renderer.getRenderableElements();

    renderStaticScene(
      {
        canvas,
        rc: props.rc,
        scale: props.scale,
        elementsMap,
        allElementsMap: props.allElementsMap,
        visibleElements,
        appState: props.appState,
        renderConfig: props.renderConfig,
      },
      isRenderThrottlingEnabled(),
    );
  });

  return <div className="excalidraw__canvas-wrapper" ref={wrapperRef} />;
};

const getRelevantAppStateProps = (
  appState: AppState,
): StaticCanvasAppState => ({
  zoom: appState.zoom,
  scrollX: appState.scrollX,
  scrollY: appState.scrollY,
  width: appState.width,
  height: appState.height,
  viewModeEnabled: appState.viewModeEnabled,
  openDialog: appState.openDialog,
  hoveredElementIds: appState.hoveredElementIds,
  offsetLeft: appState.offsetLeft,
  offsetTop: appState.offsetTop,
  theme: appState.theme,
  pendingImageElementId: appState.pendingImageElementId,
  shouldCacheIgnoreZoom: appState.shouldCacheIgnoreZoom,
  viewBackgroundColor: appState.viewBackgroundColor,
  exportScale: appState.exportScale,
  selectedElementsAreBeingDragged: appState.selectedElementsAreBeingDragged,
  gridSize: appState.gridSize,
  gridStep: appState.gridStep,
  frameRendering: appState.frameRendering,
  selectedElementIds: appState.selectedElementIds,
  frameToHighlight: appState.frameToHighlight,
  editingGroupId: appState.editingGroupId,
  currentHoveredFontFamily: appState.currentHoveredFontFamily,
  croppingElementId: appState.croppingElementId,
});

const areEqual = (
  prevProps: StaticCanvasProps,
  nextProps: StaticCanvasProps,
) => {
  if (
    prevProps.sceneNonce !== nextProps.sceneNonce ||
    prevProps.scale !== nextProps.scale ||
    // the culling inputs (viewport, editing/new/pending element)
    prevProps.renderer !== nextProps.renderer ||
    !isSameCamera(prevProps.camera, nextProps.camera)
  ) {
    return false;
  }

  return (
    isShallowEqual(
      // asserting AppState because we're being passed the whole AppState
      // but resolve to only the StaticCanvas-relevant props
      getRelevantAppStateProps(prevProps.appState as AppState),
      getRelevantAppStateProps(nextProps.appState as AppState),
    ) && isShallowEqual(prevProps.renderConfig, nextProps.renderConfig)
  );
};

export default React.memo(StaticCanvas, areEqual);
