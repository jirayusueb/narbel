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
  elements: SceneElementDto[];
}
