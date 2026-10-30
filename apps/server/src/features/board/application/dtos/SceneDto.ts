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
  /** arrows/lines: what each end is attached to, so agents can read the diagram's graph */
  startElementId?: string | null;
  endElementId?: string | null;
}

export interface SceneDto {
  title: string;
  pageId: string;
  elements: SceneElementDto[];
}

const boundId = (binding: unknown) =>
  (binding as { elementId?: string } | null)?.elementId ?? null;

const CONNECTOR_TYPES: Record<string, true> = { arrow: true, line: true };

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
  ...(CONNECTOR_TYPES[e.type]
    ? {
        startElementId: boundId(e.startBinding),
        endElementId: boundId(e.endBinding),
      }
    : {}),
});
