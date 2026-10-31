import type {
  Binding,
  BoundElement,
  Element,
  Roundness,
} from "../../domain/entities/Element";

/** An element as Excalidraw stores and sends it: plain JSON with whatever fields its version has. */
export interface ExcalidrawElement {
  id: string;
  type: string;
  version: number;
  versionNonce: number;
  isDeleted?: boolean;
  [key: string]: unknown;
}

type Guard<T> = (value: unknown) => value is T;

const isString: Guard<string> = (value) => typeof value === "string";
const isNumber: Guard<number> = (value) => typeof value === "number";
const isBoolean: Guard<boolean> = (value) => typeof value === "boolean";
const isObject = (value: unknown): value is object =>
  typeof value === "object" && value !== null;
const orNull =
  <T>(guard: Guard<T>): Guard<T | null> =>
  (value): value is T | null =>
    value === null || guard(value);
const arrayOf =
  <T>(guard: Guard<T>): Guard<T[]> =>
  (value): value is T[] =>
    Array.isArray(value) && value.every(guard);

const isBound = (value: unknown): value is BoundElement =>
  isObject(value) &&
  "id" in value &&
  isString(value.id) &&
  "type" in value &&
  isString(value.type);
const isBinding = (value: unknown): value is Binding =>
  isObject(value) && "elementId" in value && isString(value.elementId);
const isRoundness = (value: unknown): value is Roundness =>
  isObject(value) && "type" in value && isNumber(value.type);

type Typed = Omit<Element, "rest">;

// A stored value that fails its guard stays in `rest` untouched, so nothing is lost or coerced.
const FIELDS: { [K in keyof Typed]-?: Guard<Exclude<Typed[K], undefined>> } = {
  id: isString,
  type: isString,
  version: isNumber,
  versionNonce: isNumber,
  updated: isNumber,
  isDeleted: isBoolean,
  index: isString,
  x: isNumber,
  y: isNumber,
  width: isNumber,
  height: isNumber,
  angle: isNumber,
  groupIds: arrayOf(isString),
  frameId: orNull(isString),
  locked: isBoolean,
  containerId: orNull(isString),
  boundElements: orNull(arrayOf(isBound)),
  points: arrayOf(arrayOf(isNumber)),
  startBinding: orNull(isBinding),
  endBinding: orNull(isBinding),
  startArrowhead: orNull(isString),
  endArrowhead: orNull(isString),
  polygon: isBoolean,
  fileId: orNull(isString),
  scale: arrayOf(isNumber),
  text: isString,
  originalText: isString,
  fontSize: isNumber,
  fontFamily: isNumber,
  lineHeight: isNumber,
  textAlign: isString,
  verticalAlign: isString,
  name: orNull(isString),
  strokeColor: isString,
  backgroundColor: isString,
  fillStyle: isString,
  strokeWidth: isNumber,
  strokeStyle: isString,
  roughness: isNumber,
  roundness: orNull(isRoundness),
  opacity: isNumber,
};

const isField = (key: string): key is keyof Typed => Object.hasOwn(FIELDS, key);

export const toElement = (stored: ExcalidrawElement): Element => {
  const typed: Record<string, unknown> = {};
  const rest: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(stored)) {
    if (isField(key) && FIELDS[key](value)) {
      typed[key] = value;
    } else {
      rest[key] = value;
    }
  }
  // every typed key passed its field's guard
  return { ...typed, rest } as Element;
};

/** The stored form; a typed field wins over a `rest` entry of the same name. */
export const toExcalidraw = ({
  rest,
  ...typed
}: Element): ExcalidrawElement => {
  const stored: Record<string, unknown> = { ...rest };
  for (const [key, value] of Object.entries(typed)) {
    if (value !== undefined) {
      stored[key] = value;
    }
  }
  // id, type, version and versionNonce are required on Element
  return stored as ExcalidrawElement;
};
