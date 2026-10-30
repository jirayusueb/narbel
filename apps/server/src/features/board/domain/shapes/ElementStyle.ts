import type { SceneElement } from "../entities/SceneElement";

export const FILL_STYLES = [
  "hachure",
  "cross-hatch",
  "solid",
  "zigzag",
] as const;
export const STROKE_STYLES = ["solid", "dashed", "dotted"] as const;
export const ROUGHNESS = [0, 1, 2] as const;
export const TEXT_ALIGNS = ["left", "center", "right"] as const;
/** Excalidraw 0.18.1 font ids: Virgil 1, Helvetica 2, Cascadia 3, Excalifont 5, Nunito 6, Lilita One 7, Comic Shanns 8, Liberation Sans 9. */
export const FONT_FAMILIES = [1, 2, 3, 5, 6, 7, 8, 9] as const;
export const ARROWHEADS = [
  "arrow",
  "bar",
  "dot",
  "circle",
  "circle_outline",
  "triangle",
  "triangle_outline",
  "diamond",
  "diamond_outline",
  "crowfoot_one",
  "crowfoot_many",
  "crowfoot_one_or_many",
] as const;

/**
 * Where a field lands when written:
 * - "element": the element itself, every type
 * - "text": a text element, or the bound label of a rectangle/ellipse/diamond/arrow
 * - "arrow": arrows only
 */
export type Target = "element" | "text" | "arrow";

type Field =
  | { kind: "color"; default: string; on: Target }
  | { kind: "number"; min: number; max: number; default: number; on: Target }
  | { kind: "flag"; default: boolean; on: Target }
  | {
      kind: "enum";
      values: readonly (string | number)[];
      nullable?: true;
      default: string | number | null;
      on: Target;
    };

export const STYLE = {
  strokeColor: { kind: "color", default: "#1e1e1e", on: "element" },
  backgroundColor: { kind: "color", default: "transparent", on: "element" },
  fillStyle: {
    kind: "enum",
    values: FILL_STYLES,
    default: "solid",
    on: "element",
  },
  strokeWidth: { kind: "number", min: 0.5, max: 32, default: 2, on: "element" },
  strokeStyle: {
    kind: "enum",
    values: STROKE_STYLES,
    default: "solid",
    on: "element",
  },
  roughness: { kind: "enum", values: ROUGHNESS, default: 1, on: "element" },
  /** boolean in the API; stored as Excalidraw's `{type}` object or null, see `toStored` */
  roundness: { kind: "flag", default: false, on: "element" },
  opacity: { kind: "number", min: 0, max: 100, default: 100, on: "element" },
  /** radians */
  angle: {
    kind: "number",
    min: -6.2832,
    max: 6.2832,
    default: 0,
    on: "element",
  },
  fontSize: { kind: "number", min: 8, max: 200, default: 20, on: "text" },
  fontFamily: {
    kind: "enum",
    values: FONT_FAMILIES,
    default: 5,
    on: "text",
  },
  textAlign: {
    kind: "enum",
    values: TEXT_ALIGNS,
    default: "left",
    on: "text",
  },
  startArrowhead: {
    kind: "enum",
    values: ARROWHEADS,
    nullable: true,
    default: null,
    on: "arrow",
  },
  endArrowhead: {
    kind: "enum",
    values: ARROWHEADS,
    nullable: true,
    default: "arrow",
    on: "arrow",
  },
} as const satisfies Record<string, Field>;

type ValueOf<F> = F extends {
  kind: "enum";
  values: readonly (infer V)[];
  nullable: true;
}
  ? V | null
  : F extends { kind: "enum"; values: readonly (infer V)[] }
    ? V
    : F extends { kind: "number" }
      ? number
      : F extends { kind: "color" }
        ? string
        : boolean;

/** Every style field in its API form (roundness is a boolean here). */
export type Style = {
  -readonly [K in keyof typeof STYLE]: ValueOf<(typeof STYLE)[K]>;
};
export type StyleKey = keyof Style;
export const STYLE_KEYS = Object.keys(STYLE) as StyleKey[];

const isStyleKey = (key: string): key is StyleKey => key in STYLE;

const LABELLED: Record<string, true> = {
  rectangle: true,
  ellipse: true,
  diamond: true,
  arrow: true,
};

/** Shapes whose `text` becomes a bound label, like Excalidraw's "double-click to type". */
export const hasLabelSlot = (type: string): boolean => Boolean(LABELLED[type]);

/** Whether a field of `key` can land on an element of `type` (its own, or its label). */
const applies = (type: string, key: StyleKey): boolean => {
  const { on } = STYLE[key];
  if (on === "element") {
    return true;
  }
  return on === "arrow"
    ? type === "arrow"
    : type === "text" || hasLabelSlot(type);
};

/**
 * The defaults a new element of `type` gets. `role: "label"` is a bound text, which
 * Excalidraw centers. Fields that cannot land on `type` are absent.
 */
export const defaultsFor = (
  type: string,
  role: "element" | "label" = "element"
): Partial<Style> => {
  const kind = role === "label" ? "text" : type;
  const defaults: Record<string, unknown> = {};
  for (const key of STYLE_KEYS) {
    const wanted =
      role === "label"
        ? STYLE[key].on === "text"
        : applies(kind, key) && (STYLE[key].on !== "text" || kind === "text");
    if (wanted) {
      defaults[key] = STYLE[key].default;
    }
  }
  if (role === "label") {
    defaults.textAlign = "center";
  }
  return defaults as Partial<Style>;
};

/** The style keys of `fields` that cannot land on an element of `type`. */
export const misplacedStyle = (
  type: string,
  fields: Record<string, unknown>
): StyleKey | undefined =>
  Object.keys(fields).find(
    (key): key is StyleKey =>
      fields[key] !== undefined && isStyleKey(key) && !applies(type, key)
  );

/** The style fields of any object that carries them, absent ones left out. */
export const pickStyle = (source: object): Partial<Style> =>
  Object.fromEntries(
    Object.entries(source).filter(
      ([key, value]) => isStyleKey(key) && value !== undefined
    )
  );

/**
 * Splits caller fields for an element of `type`: `own` keeps non-style keys and the style
 * keys that land on the element itself, `label` gets the "text" keys when the element is
 * a label container. Style keys that apply nowhere for this type are dropped.
 */
export const routeStyle = (
  type: string,
  fields: Record<string, unknown>
): { own: Record<string, unknown>; label: Partial<Style> } => {
  const own: Record<string, unknown> = {};
  const label: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) {
      continue;
    }
    if (!isStyleKey(key)) {
      own[key] = value;
    } else if (STYLE[key].on === "text" && type !== "text") {
      if (hasLabelSlot(type)) {
        label[key] = value;
      }
    } else if (applies(type, key)) {
      own[key] = value;
    }
  }
  return { own, label: label as Partial<Style> };
};

/** API form to stored Excalidraw form. Only roundness differs: true is {type: 3} on a rectangle, {type: 2} elsewhere. */
export const toStored = (
  type: string,
  fields: Record<string, unknown>
): Record<string, unknown> => {
  const { roundness, ...rest } = fields;
  if (roundness === undefined) {
    return rest;
  }
  return {
    ...rest,
    roundness: roundness ? { type: type === "rectangle" ? 3 : 2 } : null,
  };
};

/**
 * The style fields of a stored element that differ from its defaults, in API form. A
 * container's text fields come from its live `label`. An absent stored field counts as its
 * default, so hand-made or browser-restored elements stay compact; an explicit null stays null.
 */
export const styleDiff = (
  element: SceneElement,
  label?: SceneElement
): Partial<Style> => {
  const diff: Record<string, unknown> = {};
  const own = defaultsFor(element.type) as Record<string, unknown>;
  const labelled = defaultsFor(element.type, "label") as Record<
    string,
    unknown
  >;
  for (const key of STYLE_KEYS) {
    const isLabelField = STYLE[key].on === "text" && element.type !== "text";
    const source = isLabelField ? label : element;
    const defaults = isLabelField ? labelled : own;
    if (!source || !(key in defaults)) {
      continue;
    }
    const stored = source[key];
    let value = stored === undefined ? defaults[key] : stored;
    if (key === "roundness") {
      value = Boolean(stored);
    }
    if (value !== defaults[key]) {
      diff[key] = value;
    }
  }
  return diff as Partial<Style>;
};
