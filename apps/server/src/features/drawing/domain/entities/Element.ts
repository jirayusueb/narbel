import type { Versioned } from "../rules/mergeElement";

/** A label or connector listed on the element it belongs to. */
export interface BoundElement {
  id: string;
  type: string;
}

/** What a connector end is attached to; Excalidraw's other binding fields stay on the object. */
export interface Binding {
  elementId: string;
}

export interface Roundness {
  type: number;
}

/**
 * One drawing element: the fields the rules read or write, typed. Every other field of the
 * stored element rides along in `rest`, which the domain carries but never reads.
 */
export interface Element extends Versioned {
  id: string;
  type: string;
  updated?: number;
  isDeleted?: boolean;
  /** fractional z-order key */
  index?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  angle?: number;
  groupIds?: string[];
  frameId?: string | null;
  locked?: boolean;
  /** a label's shape */
  containerId?: string | null;
  /** a shape's label and attached connectors */
  boundElements?: BoundElement[] | null;
  /** connector and freedraw points, relative to x/y */
  points?: number[][];
  startBinding?: Binding | null;
  endBinding?: Binding | null;
  startArrowhead?: string | null;
  endArrowhead?: string | null;
  /** closed line */
  polygon?: boolean;
  fileId?: string | null;
  /** image flip */
  scale?: number[];
  text?: string;
  /** text before wrapping */
  originalText?: string;
  fontSize?: number;
  fontFamily?: number;
  lineHeight?: number;
  textAlign?: string;
  verticalAlign?: string;
  /** frame title */
  name?: string | null;
  strokeColor?: string;
  backgroundColor?: string;
  fillStyle?: string;
  strokeWidth?: number;
  strokeStyle?: string;
  roughness?: number;
  roundness?: Roundness | null;
  opacity?: number;
  rest: Record<string, unknown>;
}
