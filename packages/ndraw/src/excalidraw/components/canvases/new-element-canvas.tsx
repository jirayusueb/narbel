import { useEffect, useRef } from "react";
import type { NonDeletedSceneElementsMap } from "../../element/types";
import type { AppState } from "../../types";
import type { StaticCanvasRenderConfig } from "../../scene/types";
import type { Renderer, RendererCamera } from "../../scene/renderer";
import type { RoughCanvas } from "roughjs/bin/canvas";
import { renderNewElementScene } from "../../renderer/render-new-element-scene";
import { isRenderThrottlingEnabled } from "../../react-utils";

interface NewElementCanvasProps {
  appState: AppState;
  renderer: Renderer;
  camera: RendererCamera;
  allElementsMap: NonDeletedSceneElementsMap;
  scale: number;
  rc: RoughCanvas;
  renderConfig: StaticCanvasRenderConfig;
}

const NewElementCanvas = (props: NewElementCanvasProps) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    if (!canvasRef.current) {
      return;
    }
    props.renderer.setCamera(props.camera);
    renderNewElementScene(
      {
        canvas: canvasRef.current,
        scale: props.scale,
        newElement: props.appState.newElement,
        elementsMap: props.renderer.getRenderableElements().elementsMap,
        allElementsMap: props.allElementsMap,
        rc: props.rc,
        renderConfig: props.renderConfig,
        appState: props.appState,
      },
      isRenderThrottlingEnabled(),
    );
  });

  return (
    <canvas
      className="excalidraw__canvas"
      style={{
        width: props.appState.width,
        height: props.appState.height,
      }}
      width={props.appState.width * props.scale}
      height={props.appState.height * props.scale}
      ref={canvasRef}
    />
  );
};

export default NewElementCanvas;
