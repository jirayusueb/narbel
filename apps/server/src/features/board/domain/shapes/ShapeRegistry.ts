import type { SceneElement } from "../entities/SceneElement";
import { isLinear, polylineMidpoint } from "../rules/geometry";
import {
  STYLE,
  defaultsFor,
  pickStyle,
  routeStyle,
  toStored,
} from "./ElementStyle";
import type { Style } from "./ElementStyle";

export const SHAPE_TYPES = [
  "rectangle",
  "ellipse",
  "diamond",
  "text",
  "arrow",
  "line",
  "frame",
] as const;
export type ShapeType = (typeof SHAPE_TYPES)[number];

export interface Shape extends Partial<Style> {
  type: ShapeType;
  /** omitted x or y: the caller asks for an automatic layout */
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  text?: string;
  /** optional client-chosen id, so a later element in the same batch can bind to this one */
  id?: string;
  /** arrow/line only: element ids (or batch ids) this connector attaches to */
  startElementId?: string;
  endElementId?: string;
  name?: string;
  frameId?: string;
}

export interface ElementIdentity {
  id: string;
  seed: number;
  versionNonce: number;
  updated: number;
}

const LINE_HEIGHT = 1.25;
const LABEL_PADDING = 20;
const MIN_LABELLED = { width: 100, height: 60 };

export const LABEL_FOLLOWS = [
  "groupIds",
  "frameId",
  "locked",
  "angle",
  "opacity",
] as const;

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

export const measure = (text: string, fontSize: number): Size => {
  const lines = text.split("\n");
  return {
    width: Math.max(...lines.map((l) => l.length), 1) * fontSize * 0.6,
    height: lines.length * fontSize * LINE_HEIGHT,
  };
};

const fontSizeOf = (shape: object) =>
  "fontSize" in shape && typeof shape.fontSize === "number"
    ? shape.fontSize
    : STYLE.fontSize.default;

// a labelled shape without an explicit size grows to fit its label
const box = (shape: Shape): Size => {
  if (!shape.text) {
    return { width: shape.width ?? 100, height: shape.height ?? 100 };
  }
  const inset = INSET[shape.type] ?? 1;
  const text = measure(shape.text, fontSizeOf(shape));
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
  const text = measure(shape.text ?? "", fontSizeOf(shape));
  return {
    width: shape.width ?? text.width,
    height: shape.height ?? text.height,
  };
};

const linear = (
  _: Shape,
  { width, height }: Size,
  ends: Extras = {}
): Extras => ({
  points: [
    [0, 0],
    [width, height],
  ],
  lastCommittedPoint: null,
  startBinding: null,
  endBinding: null,
  ...ends,
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
      verticalAlign: "top",
      containerId: null,
      lineHeight: LINE_HEIGHT,
      autoResize: true,
    }),
  },
  // lines default to a horizontal 100 unit stroke
  arrow: {
    size: (s) => ({ width: s.width ?? 100, height: s.height ?? 0 }),
    extras: linear,
  },
  line: {
    size: (s) => ({ width: s.width ?? 100, height: s.height ?? 0 }),
    extras: (s, size) =>
      linear(s, size, { startArrowhead: null, endArrowhead: null }),
  },
  frame: {
    size: (s) => ({ width: s.width ?? 0, height: s.height ?? 0 }),
    extras: (s) => ({ name: s.name ?? null }),
  },
};

export const buildElement = (
  shape: Shape,
  identity: ElementIdentity
): SceneElement => {
  const spec = SHAPES[shape.type];
  const size = spec.size(shape);
  const { own } = routeStyle(shape.type, pickStyle(shape));
  return {
    id: identity.id,
    type: shape.type,
    // the use case lays out unplaced shapes before anything is written
    x: shape.x ?? 0,
    y: shape.y ?? 0,
    ...size,
    ...toStored(shape.type, { ...defaultsFor(shape.type), ...own }),
    groupIds: [],
    frameId: shape.frameId ?? null,
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

export const fitLabel = (
  label: SceneElement,
  container: SceneElement
): SceneElement => {
  const size = measure(String(label.text ?? ""), fontSizeOf(label));
  const center = isLinear(container)
    ? polylineMidpoint(container)
    : {
        x: Number(container.x) + Number(container.width) / 2,
        y: Number(container.y) + Number(container.height) / 2,
      };
  return {
    ...label,
    ...size,
    x: center.x - size.width / 2,
    y: center.y - size.height / 2,
    ...Object.fromEntries(
      LABEL_FOLLOWS.filter((key) => key in container).map((key) => [
        key,
        container[key],
      ])
    ),
  };
};

/** A text element bound inside `container`; the container must list it in `boundElements`. */
export const buildLabel = (
  container: SceneElement,
  text: string,
  style: Partial<Style>,
  identity: ElementIdentity
): SceneElement =>
  fitLabel(
    {
      ...buildElement(
        {
          type: "text",
          text,
          strokeColor: String(container.strokeColor),
          textAlign: "center",
          ...style,
        },
        identity
      ),
      verticalAlign: "middle",
      containerId: container.id,
    },
    container
  );

export const refitText = (element: SceneElement): SceneElement => ({
  ...element,
  ...measure(String(element.text ?? ""), fontSizeOf(element)),
});
