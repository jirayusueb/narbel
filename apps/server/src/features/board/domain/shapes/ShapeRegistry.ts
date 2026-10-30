import type { SceneElement } from "../entities/SceneElement";

export const SHAPE_TYPES = [
  "rectangle",
  "ellipse",
  "diamond",
  "text",
  "arrow",
  "line",
] as const;
export type ShapeType = (typeof SHAPE_TYPES)[number];

export interface Shape {
  type: ShapeType;
  /** omitted x or y: the caller asks for an automatic layout */
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  /** content of a text element, label of a rectangle/ellipse/diamond */
  text?: string;
  strokeColor?: string;
  backgroundColor?: string;
  /** optional client-chosen id, so a later element in the same batch can bind to this one */
  id?: string;
  /** arrow/line only: element ids (or batch ids) this connector attaches to */
  startElementId?: string;
  endElementId?: string;
}

export interface ElementIdentity {
  id: string;
  seed: number;
  versionNonce: number;
  updated: number;
}

export const DEFAULT_STROKE = "#1e1e1e";
export const DEFAULT_BACKGROUND = "transparent";

const FONT_SIZE = 20;
const LINE_HEIGHT = 1.25;
const CHAR_WIDTH = FONT_SIZE * 0.6;
const LABEL_PADDING = 20;
const MIN_LABELLED = { width: 100, height: 60 };

/** Shapes whose `text` becomes a bound label, like Excalidraw's "double-click to type". */
export const LABELLED: Record<string, true> = {
  rectangle: true,
  ellipse: true,
  diamond: true,
};
// how much larger than its text a shape must be for the text to sit inside its outline
const INSET: Record<string, number> = {
  rectangle: 1,
  ellipse: Math.SQRT2,
  diamond: 2,
};

interface Size {
  width: number;
  height: number;
}
type Extras = Record<string, unknown>;

const measure = (text: string): Size => {
  const lines = text.split("\n");
  return {
    width: Math.max(...lines.map((l) => l.length), 1) * CHAR_WIDTH,
    height: lines.length * FONT_SIZE * LINE_HEIGHT,
  };
};

// a labelled shape without an explicit size grows to fit its label
const box = (shape: Shape): Size => {
  if (!shape.text) {
    return { width: shape.width ?? 100, height: shape.height ?? 100 };
  }
  const inset = INSET[shape.type] ?? 1;
  const text = measure(shape.text);
  return {
    width:
      shape.width ??
      Math.max(
        MIN_LABELLED.width,
        Math.ceil(text.width * inset + 2 * LABEL_PADDING)
      ),
    height:
      shape.height ??
      Math.max(
        MIN_LABELLED.height,
        Math.ceil(text.height * inset + 2 * LABEL_PADDING)
      ),
  };
};

const textSize = (shape: Shape): Size => {
  const text = measure(shape.text ?? "");
  return {
    width: shape.width ?? text.width,
    height: shape.height ?? text.height,
  };
};

const line =
  (endArrowhead: string | null) =>
  (_: Shape, { width, height }: Size): Extras => ({
    points: [
      [0, 0],
      [width, height],
    ],
    lastCommittedPoint: null,
    startBinding: null,
    endBinding: null,
    startArrowhead: null,
    endArrowhead,
  });

interface ShapeSpec {
  size: (shape: Shape) => Size;
  extras: (shape: Shape, size: Size) => Extras;
}

const noExtras = (): Extras => ({});

export const SHAPES: Record<ShapeType, ShapeSpec> = {
  rectangle: { size: box, extras: noExtras },
  ellipse: { size: box, extras: noExtras },
  diamond: { size: box, extras: noExtras },
  text: {
    size: textSize,
    extras: (shape) => ({
      text: shape.text ?? "",
      originalText: shape.text ?? "",
      fontSize: FONT_SIZE,
      fontFamily: 5,
      textAlign: "left",
      verticalAlign: "top",
      containerId: null,
      lineHeight: LINE_HEIGHT,
      autoResize: true,
    }),
  },
  // lines default to a horizontal 100 unit stroke
  arrow: {
    size: (s) => ({ width: s.width ?? 100, height: s.height ?? 0 }),
    extras: line("arrow"),
  },
  line: {
    size: (s) => ({ width: s.width ?? 100, height: s.height ?? 0 }),
    extras: line(null),
  },
};

export const buildElement = (
  shape: Shape,
  identity: ElementIdentity
): SceneElement => {
  const spec = SHAPES[shape.type];
  const size = spec.size(shape);
  return {
    id: identity.id,
    type: shape.type,
    // the use case lays out unplaced shapes before anything is written
    x: shape.x ?? 0,
    y: shape.y ?? 0,
    ...size,
    angle: 0,
    strokeColor: shape.strokeColor ?? DEFAULT_STROKE,
    backgroundColor: shape.backgroundColor ?? DEFAULT_BACKGROUND,
    fillStyle: "solid",
    strokeWidth: 2,
    strokeStyle: "solid",
    roughness: 1,
    opacity: 100,
    groupIds: [],
    frameId: null,
    roundness: null,
    seed: identity.seed,
    version: 1,
    versionNonce: identity.versionNonce,
    isDeleted: false,
    boundElements: null,
    updated: identity.updated,
    link: null,
    locked: false,
    ...spec.extras(shape, size),
  };
};

/** The label resized to its text and centered in its container, as Excalidraw draws it. */
export const fitLabel = (
  label: SceneElement,
  container: SceneElement
): SceneElement => {
  const size = measure(String(label.text ?? ""));
  return {
    ...label,
    ...size,
    x: Number(container.x) + (Number(container.width) - size.width) / 2,
    y: Number(container.y) + (Number(container.height) - size.height) / 2,
  };
};

/** A text element bound inside `container`; the container must list it in `boundElements`. */
export const buildLabel = (
  container: SceneElement,
  text: string,
  identity: ElementIdentity
): SceneElement =>
  fitLabel(
    {
      ...buildElement(
        { type: "text", text, strokeColor: String(container.strokeColor) },
        identity
      ),
      textAlign: "center",
      verticalAlign: "middle",
      containerId: container.id,
    },
    container
  );
