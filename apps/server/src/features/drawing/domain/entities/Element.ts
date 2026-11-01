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
 * Fields are `declare`d so an absent field stays absent, as it is in the stored element.
 */
export class Element implements Versioned {
  declare id: string;
  declare type: string;
  declare version: number;
  declare versionNonce: number;
  declare updated?: number;
  declare isDeleted?: boolean;
  /** fractional z-order key */
  declare index?: string;
  declare x?: number;
  declare y?: number;
  declare width?: number;
  declare height?: number;
  declare angle?: number;
  declare groupIds?: string[];
  declare frameId?: string | null;
  declare locked?: boolean;
  /** a label's shape */
  declare containerId?: string | null;
  /** a shape's label and attached connectors */
  declare boundElements?: BoundElement[] | null;
  /** connector and freedraw points, relative to x/y */
  declare points?: number[][];
  declare startBinding?: Binding | null;
  declare endBinding?: Binding | null;
  declare startArrowhead?: string | null;
  declare endArrowhead?: string | null;
  /** closed line */
  declare polygon?: boolean;
  declare fileId?: string | null;
  /** image flip */
  declare scale?: number[];
  declare text?: string;
  /** text before wrapping */
  declare originalText?: string;
  declare fontSize?: number;
  declare fontFamily?: number;
  declare lineHeight?: number;
  declare textAlign?: string;
  declare verticalAlign?: string;
  /** frame title */
  declare name?: string | null;
  declare strokeColor?: string;
  declare backgroundColor?: string;
  declare fillStyle?: string;
  declare strokeWidth?: number;
  declare strokeStyle?: string;
  declare roughness?: number;
  declare roundness?: Roundness | null;
  declare opacity?: number;
  declare rest: Record<string, unknown>;

  private constructor(
    typed: Omit<Element, "rest">,
    rest: Record<string, unknown>
  ) {
    Object.assign(this, typed);
    this.rest = rest;
  }

  /** `typed` holds only keys that passed their field's guard; see `toElement`. */
  static restore(
    typed: Omit<Element, "rest">,
    rest: Record<string, unknown>
  ): Element {
    return new Element(typed, rest);
  }
}
