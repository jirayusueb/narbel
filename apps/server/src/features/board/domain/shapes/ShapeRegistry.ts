import { err, ok } from "../../../../shared/kernel/types/Result";
import type { Result } from "../../../../shared/kernel/types/Result";
import type { SceneElement } from "../entities/SceneElement";
import { isLinear, polylineMidpoint } from "../rules/geometry";
import {
  STYLE,
  defaultsFor,
  misplacedStyle,
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

interface BaseShape extends Partial<Style> {
  /** omitted x or y: the caller asks for an automatic layout */
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  /** optional client-chosen id, so a later element in the same batch can bind to this one */
  id?: string;
}

interface Contained extends BaseShape {
  frameId?: string;
}

/** element ids (or batch ids) a connector attaches to */
interface Ends {
  startElementId?: string;
  endElementId?: string;
}

export interface BoxShape extends Contained {
  type: "rectangle" | "ellipse" | "diamond";
  text?: string;
}
export interface TextShape extends Contained {
  type: "text";
  text?: string;
}
export interface ArrowShape extends Contained, Ends {
  type: "arrow";
  text?: string;
}
export interface LineShape extends Contained, Ends {
  type: "line";
}
export interface FrameShape extends BaseShape {
  type: "frame";
  name?: string;
}

export type Shape = BoxShape | TextShape | ArrowShape | LineShape | FrameShape;

/** The flat shape an agent sends; `parseShape` narrows it into a `Shape`. */
export interface ShapeInput extends BaseShape, Ends {
  type: ShapeType;
  text?: string;
  name?: string;
  frameId?: string;
}

export interface ShapeRejection {
  outcome:
    | "bad-style"
    | "not-connector"
    | "nested-frame"
    | "frame-geometry"
    | "connector-text"
    | "connector-position";
  detail?: string;
}

export const frameIdOf = (shape: Shape) =>
  "frameId" in shape ? shape.frameId : undefined;

export const textOf = (shape: Shape) =>
  "text" in shape ? shape.text : undefined;

export const endsOf = (shape: Shape): Ends =>
  shape.type === "arrow" || shape.type === "line" ? shape : {};

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

// Excalidraw 0.18.1 getBoundTextMaxWidth: max(0.7 x arrow width, 11 x fontSize)
const arrowLabelMaxWidth = (arrowWidth: number, fontSize: number) =>
  Math.max(0.7 * arrowWidth, fontSize * 11);

/** Greedy word wrap; a word longer than maxWidth stays unbroken. */
const wrapText = (text: string, fontSize: number, maxWidth: number): string => {
  const perLine = Math.max(1, Math.floor(maxWidth / (fontSize * 0.6)));
  return text
    .split("\n")
    .map((paragraph) => {
      const lines: string[] = [];
      let line = "";
      for (const word of paragraph.split(/\s+/u).filter(Boolean)) {
        if (line && line.length + 1 + word.length > perLine) {
          lines.push(line);
          line = word;
        } else {
          line = line ? `${line} ${word}` : word;
        }
      }
      lines.push(line);
      return lines.join("\n");
    })
    .join("\n");
};

/** Size an arrow label takes at the narrowest wrap, before the arrow's width is known. */
export const arrowLabelSize = (text: string, fontSize: number): Size =>
  measure(wrapText(text, fontSize, arrowLabelMaxWidth(0, fontSize)), fontSize);

const fontSizeOf = (shape: object) =>
  "fontSize" in shape && typeof shape.fontSize === "number"
    ? shape.fontSize
    : STYLE.fontSize.default;

// a labelled shape without an explicit size grows to fit its label
const box = (shape: BoxShape): Size => {
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

const textSize = (shape: TextShape): Size => {
  const text = measure(shape.text ?? "", fontSizeOf(shape));
  return {
    width: shape.width ?? text.width,
    height: shape.height ?? text.height,
  };
};

const linear = ({ width, height }: Size, ends: Extras = {}): Extras => ({
  points: [
    [0, 0],
    [width, height],
  ],
  lastCommittedPoint: null,
  startBinding: null,
  endBinding: null,
  ...ends,
});

// lines default to a horizontal 100 unit stroke
const strokeSize = (shape: ArrowShape | LineShape): Size => ({
  width: shape.width ?? 100,
  height: shape.height ?? 0,
});

const layout = (shape: Shape): { size: Size; extras: Extras } => {
  switch (shape.type) {
    case "rectangle":
    case "ellipse":
    case "diamond": {
      return { size: box(shape), extras: {} };
    }
    case "text": {
      return {
        size: textSize(shape),
        extras: {
          text: shape.text ?? "",
          originalText: shape.text ?? "",
          verticalAlign: "top",
          containerId: null,
          lineHeight: LINE_HEIGHT,
          autoResize: true,
        },
      };
    }
    case "arrow": {
      const size = strokeSize(shape);
      return { size, extras: linear(size) };
    }
    case "line": {
      const size = strokeSize(shape);
      return {
        size,
        extras: linear(size, { startArrowhead: null, endArrowhead: null }),
      };
    }
    case "frame": {
      return {
        size: { width: shape.width ?? 0, height: shape.height ?? 0 },
        extras: { name: shape.name ?? null },
      };
    }
    default: {
      return shape satisfies never;
    }
  }
};

const GEOMETRY_KEYS = ["x", "y", "width", "height"] as const;
const connectorPlaced = (input: ShapeInput) =>
  (input.x !== undefined && input.y !== undefined) ||
  (input.startElementId !== undefined && input.endElementId !== undefined);

const styleRejection = (input: ShapeInput): ShapeRejection | undefined => {
  const misplaced = misplacedStyle(input.type, pickStyle(input));
  if (!misplaced) {
    return;
  }
  const where =
    STYLE[misplaced].on === "arrow"
      ? "arrows only"
      : "text, rectangle, ellipse, diamond and arrow elements only";
  return {
    outcome: "bad-style",
    detail: `${misplaced} applies to ${where}, not ${input.type}`,
  };
};

const geometryGiven = (input: ShapeInput) =>
  GEOMETRY_KEYS.filter((key) => input[key] !== undefined).length;

/**
 * Narrows the flat tool input into the one shape its `type` allows.
 * Fields that do not exist on a type (a frame's text, a box's name) are dropped, as before;
 * combinations that never worked are rejected.
 */
export const parseShape = (
  input: ShapeInput
): Result<Shape, ShapeRejection> => {
  const { startElementId, endElementId, name, text, frameId, ...base } = input;
  const rejected = styleRejection(input);
  if (rejected) {
    return err(rejected);
  }
  const hasEnds = startElementId !== undefined || endElementId !== undefined;
  switch (input.type) {
    case "rectangle":
    case "ellipse":
    case "diamond":
    case "text": {
      return hasEnds
        ? err({ outcome: "not-connector" })
        : ok({ ...base, type: input.type, text, frameId });
    }
    case "frame": {
      if (hasEnds) {
        return err({ outcome: "not-connector" });
      }
      if (frameId !== undefined) {
        return err({ outcome: "nested-frame" });
      }
      const given = geometryGiven(input);
      return given === 0 || given === GEOMETRY_KEYS.length
        ? ok({ ...base, type: "frame", name })
        : err({ outcome: "frame-geometry" });
    }
    case "arrow": {
      return connectorPlaced(input)
        ? ok({
            ...base,
            type: "arrow",
            text,
            startElementId,
            endElementId,
            frameId,
          })
        : err({ outcome: "connector-position" });
    }
    case "line": {
      if (text !== undefined) {
        return err({ outcome: "connector-text" });
      }
      return connectorPlaced(input)
        ? ok({ ...base, type: "line", startElementId, endElementId, frameId })
        : err({ outcome: "connector-position" });
    }
    default: {
      return input.type satisfies never;
    }
  }
};

export const buildElement = (
  shape: Shape,
  identity: ElementIdentity
): SceneElement => {
  const { size, extras } = layout(shape);
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
    frameId: frameIdOf(shape) ?? null,
    seed: identity.seed,
    version: 1,
    versionNonce: identity.versionNonce,
    isDeleted: false,
    boundElements: null,
    updated: identity.updated,
    link: null,
    locked: false,
    ...extras,
  };
};

export const fitLabel = (
  label: SceneElement,
  container: SceneElement
): SceneElement => {
  const onArrow = isLinear(container);
  const fontSize = fontSizeOf(label);
  const text = onArrow
    ? wrapText(
        String(label.originalText ?? label.text ?? ""),
        fontSize,
        arrowLabelMaxWidth(Number(container.width), fontSize)
      )
    : String(label.text ?? "");
  const size = measure(text, fontSize);
  const center = onArrow
    ? polylineMidpoint(container)
    : {
        x: Number(container.x) + Number(container.width) / 2,
        y: Number(container.y) + Number(container.height) / 2,
      };
  return {
    ...label,
    ...size,
    text,
    ...(onArrow ? { originalText: label.originalText ?? label.text } : {}),
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
