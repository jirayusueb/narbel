import React, { useEffect, useRef } from "react";
import { isShallowEqual, sceneCoordsToViewportCoords } from "../../utils";
import { CURSOR_TYPE } from "../../constants";
import { RemotePointerSmoother } from "../../remote-pointer-smoothing";
import type { SocketId } from "../../types";
import type { DOMAttributes } from "react";
import type { AppState, Device, InteractiveCanvasAppState } from "../../types";
import type {
  InteractiveCanvasRenderConfig,
  RenderInteractiveSceneCallback,
} from "../../scene/types";
import type {
  NonDeletedExcalidrawElement,
  NonDeletedSceneElementsMap,
} from "../../element/types";
import { isSameCamera } from "../../scene/renderer";
import type { Renderer, RendererCamera } from "../../scene/renderer";
import { isRenderThrottlingEnabled } from "../../react-utils";
import { t } from "../../i18n";
import { renderInteractiveScene } from "../../renderer/interactive-scene";

type InteractiveCanvasProps = {
  containerRef: React.RefObject<HTMLDivElement | null>;
  canvas: HTMLCanvasElement | null;
  renderer: Renderer;
  camera: RendererCamera;
  selectedElements: readonly NonDeletedExcalidrawElement[];
  allElementsMap: NonDeletedSceneElementsMap;
  sceneNonce: number | undefined;
  selectionNonce: number | undefined;
  scale: number;
  appState: InteractiveCanvasAppState;
  device: Device;
  renderInteractiveSceneCallback: (
    data: RenderInteractiveSceneCallback,
  ) => void;
  handleCanvasRef: (canvas: HTMLCanvasElement | null) => void;
  onContextMenu: Exclude<
    DOMAttributes<HTMLCanvasElement | HTMLDivElement>["onContextMenu"],
    undefined
  >;
  onPointerMove: Exclude<
    DOMAttributes<HTMLCanvasElement>["onPointerMove"],
    undefined
  >;
  onPointerUp: Exclude<
    DOMAttributes<HTMLCanvasElement>["onPointerUp"],
    undefined
  >;
  onPointerCancel: Exclude<
    DOMAttributes<HTMLCanvasElement>["onPointerCancel"],
    undefined
  >;
  onTouchMove: Exclude<
    DOMAttributes<HTMLCanvasElement>["onTouchMove"],
    undefined
  >;
  onPointerDown: Exclude<
    DOMAttributes<HTMLCanvasElement>["onPointerDown"],
    undefined
  >;
  onDoubleClick: Exclude<
    DOMAttributes<HTMLCanvasElement>["onDoubleClick"],
    undefined
  >;
};

const InteractiveCanvas = (props: InteractiveCanvasProps) => {
  const isComponentMounted = useRef(false);
  const smootherRef = useRef<RemotePointerSmoother | null>(null);
  const rafRef = useRef<number | null>(null);
  const drawRef = useRef<((throttle: boolean) => void) | null>(null);
  const latestZoomRef = useRef(1);

  useEffect(() => {
    if (!isComponentMounted.current) {
      isComponentMounted.current = true;
      return;
    }

    const remotePointerButton: InteractiveCanvasRenderConfig["remotePointerButton"] =
      new Map();
    const remoteSelectedElementIds: InteractiveCanvasRenderConfig["remoteSelectedElementIds"] =
      new Map();
    const remotePointerUsernames: InteractiveCanvasRenderConfig["remotePointerUsernames"] =
      new Map();
    const remotePointerUserStates: InteractiveCanvasRenderConfig["remotePointerUserStates"] =
      new Map();
    const scenePointers = new Map<SocketId, { x: number; y: number }>();
    smootherRef.current ??= new RemotePointerSmoother();
    const smoother = smootherRef.current;
    latestZoomRef.current = props.appState.zoom.value;

    props.appState.collaborators.forEach((user, socketId) => {
      if (user.selectedElementIds) {
        for (const id of Object.keys(user.selectedElementIds)) {
          if (!remoteSelectedElementIds.has(id)) {
            remoteSelectedElementIds.set(id, []);
          }
          remoteSelectedElementIds.get(id)!.push(socketId);
        }
      }
      if (!user.pointer || user.pointer.renderCursor === false) {
        return;
      }
      if (user.username) {
        remotePointerUsernames.set(socketId, user.username);
      }
      if (user.userState) {
        remotePointerUserStates.set(socketId, user.userState);
      }
      remotePointerButton.set(socketId, user.button);
      scenePointers.set(socketId, { x: user.pointer.x, y: user.pointer.y });
    });

    const now = performance.now();
    smoother.setTargets(scenePointers, now);

    const selectionColor =
      (props.containerRef?.current &&
        getComputedStyle(props.containerRef.current).getPropertyValue(
          "--color-selection",
        )) ||
      "#6965db";

    // same camera the static canvas applied; setCamera is a no-op then
    props.renderer.setCamera(props.camera);
    const { elementsMap, visibleElements } =
      props.renderer.getRenderableElements();

    const draw = (throttle: boolean) => {
      const remotePointerViewportCoords: InteractiveCanvasRenderConfig["remotePointerViewportCoords"] =
        new Map();
      for (const socketId of scenePointers.keys()) {
        const shown = smoother.get(socketId)!;
        remotePointerViewportCoords.set(
          socketId,
          sceneCoordsToViewportCoords(
            { sceneX: shown.x, sceneY: shown.y },
            props.appState,
          ),
        );
      }
      renderInteractiveScene(
        {
          canvas: props.canvas,
          elementsMap,
          visibleElements,
          selectedElements: props.selectedElements,
          allElementsMap: props.allElementsMap,
          scale: window.devicePixelRatio,
          appState: props.appState,
          renderConfig: {
            remotePointerViewportCoords,
            remotePointerButton,
            remoteSelectedElementIds,
            remotePointerUsernames,
            remotePointerUserStates,
            selectionColor,
            renderScrollbars: false,
          },
          device: props.device,
          callback: props.renderInteractiveSceneCallback,
        },
        throttle,
      );
    };
    drawRef.current = draw;
    draw(isRenderThrottlingEnabled());

    // Pointer easing runs outside React: the loop redraws the interactive canvas directly until the cursors settle.
    if (rafRef.current === null && smoother.advanceTo(now, props.appState.zoom.value)) {
      const tick = (time: number) => {
        const more = smoother.advanceTo(time, latestZoomRef.current);
        drawRef.current?.(true);
        rafRef.current = more ? requestAnimationFrame(tick) : null;
      };
      rafRef.current = requestAnimationFrame(tick);
    }
  });

  useEffect(
    () => () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    },
    [],
  );

  return (
    <canvas
      className="excalidraw__canvas interactive"
      style={{
        width: props.appState.width,
        height: props.appState.height,
        cursor: props.appState.viewModeEnabled
          ? CURSOR_TYPE.GRAB
          : CURSOR_TYPE.AUTO,
      }}
      width={props.appState.width * props.scale}
      height={props.appState.height * props.scale}
      ref={props.handleCanvasRef}
      onContextMenu={props.onContextMenu}
      onPointerMove={props.onPointerMove}
      onPointerUp={props.onPointerUp}
      onPointerCancel={props.onPointerCancel}
      onTouchMove={props.onTouchMove}
      onPointerDown={props.onPointerDown}
      onDoubleClick={
        props.appState.viewModeEnabled ? undefined : props.onDoubleClick
      }
    >
      {t("labels.drawingCanvas")}
    </canvas>
  );
};

const getRelevantAppStateProps = (
  appState: AppState,
): InteractiveCanvasAppState => ({
  zoom: appState.zoom,
  scrollX: appState.scrollX,
  scrollY: appState.scrollY,
  width: appState.width,
  height: appState.height,
  viewModeEnabled: appState.viewModeEnabled,
  openDialog: appState.openDialog,
  editingGroupId: appState.editingGroupId,
  editingLinearElement: appState.editingLinearElement,
  selectedElementIds: appState.selectedElementIds,
  frameToHighlight: appState.frameToHighlight,
  offsetLeft: appState.offsetLeft,
  offsetTop: appState.offsetTop,
  theme: appState.theme,
  pendingImageElementId: appState.pendingImageElementId,
  selectionElement: appState.selectionElement,
  selectedGroupIds: appState.selectedGroupIds,
  selectedLinearElement: appState.selectedLinearElement,
  multiElement: appState.multiElement,
  isBindingEnabled: appState.isBindingEnabled,
  suggestedBindings: appState.suggestedBindings,
  isRotating: appState.isRotating,
  elementsToHighlight: appState.elementsToHighlight,
  collaborators: appState.collaborators, // Necessary for collab. sessions
  activeEmbeddable: appState.activeEmbeddable,
  snapLines: appState.snapLines,
  zenModeEnabled: appState.zenModeEnabled,
  editingTextElement: appState.editingTextElement,
  isCropping: appState.isCropping,
  croppingElementId: appState.croppingElementId,
  searchMatches: appState.searchMatches,
});

const areEqual = (
  prevProps: InteractiveCanvasProps,
  nextProps: InteractiveCanvasProps,
) => {
  // This could be further optimised if needed, as we don't have to render interactive canvas on each scene mutation
  if (
    prevProps.selectionNonce !== nextProps.selectionNonce ||
    prevProps.sceneNonce !== nextProps.sceneNonce ||
    prevProps.scale !== nextProps.scale ||
    // the culling inputs (viewport, editing/new/pending element)
    prevProps.renderer !== nextProps.renderer ||
    !isSameCamera(prevProps.camera, nextProps.camera) ||
    prevProps.selectedElements !== nextProps.selectedElements
  ) {
    return false;
  }

  // Comparing the interactive appState for changes in case of some edge cases
  return isShallowEqual(
    // asserting AppState because we're being passed the whole AppState
    // but resolve to only the InteractiveCanvas-relevant props
    getRelevantAppStateProps(prevProps.appState as AppState),
    getRelevantAppStateProps(nextProps.appState as AppState),
  );
};

export default React.memo(InteractiveCanvas, areEqual);
