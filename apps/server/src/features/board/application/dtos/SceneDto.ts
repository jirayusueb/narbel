export interface SceneElementDto {
  id: string;
  type: string;
  x: unknown;
  y: unknown;
  width: unknown;
  height: unknown;
  text?: unknown;
  strokeColor: unknown;
  backgroundColor: unknown;
}

export interface SceneDto {
  title: string;
  pageId: string;
  elements: SceneElementDto[];
}

export const toSceneElementDto = (e: {
  id: string;
  type: string;
  [key: string]: unknown;
}): SceneElementDto => ({
  id: e.id,
  type: e.type,
  x: e.x,
  y: e.y,
  width: e.width,
  height: e.height,
  ...(e.type === "text" ? { text: e.text } : {}),
  strokeColor: e.strokeColor,
  backgroundColor: e.backgroundColor,
});
