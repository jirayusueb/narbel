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
  x: number;
  y: number;
  width?: number;
  height?: number;
  text?: string;
  strokeColor?: string;
  backgroundColor?: string;
}

export interface ElementIdentity {
  id: string;
  seed: number;
  versionNonce: number;
  updated: number;
}

const FONT_SIZE = 20;
const LINE_HEIGHT = 1.25;
const CHAR_WIDTH = FONT_SIZE * 0.6;

interface Size {
  width: number;
  height: number;
}
type Extras = Record<string, unknown>;

const box = (shape: Shape): Size => ({
  width: shape.width ?? 100,
  height: shape.height ?? 100,
});

const textSize = (shape: Shape): Size => {
  const lines = (shape.text ?? "").split("\n");
  return {
    width:
      shape.width ?? Math.max(...lines.map((l) => l.length), 1) * CHAR_WIDTH,
    height: shape.height ?? lines.length * FONT_SIZE * LINE_HEIGHT,
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

export function buildElement(
  shape: Shape,
  identity: ElementIdentity
): SceneElement {
  const spec = SHAPES[shape.type];
  const size = spec.size(shape);
  return {
    id: identity.id,
    type: shape.type,
    x: shape.x,
    y: shape.y,
    ...size,
    angle: 0,
    strokeColor: shape.strokeColor ?? "#1e1e1e",
    backgroundColor: shape.backgroundColor ?? "transparent",
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
}
