import { z } from "zod";

import { STYLE, STYLE_KEYS } from "../../domain/shapes/ElementStyle";
import type { Style, StyleKey } from "../../domain/shapes/ElementStyle";

/** Agent-facing wording; `satisfies` fails the build when STYLE gains or loses a key. */
const STYLE_DOCS = {
  strokeColor: "Outline and text color, hex. Default #1e1e1e",
  backgroundColor: "Fill color, hex or transparent. Default transparent",
  fillStyle:
    "Default solid. get_board_image ignores fillStyle and draws every fill solid",
  strokeWidth: "Default 2 (Excalidraw offers 1, 2, 4)",
  strokeStyle: "Default solid",
  roughness:
    "0 architect, 1 artist (default), 2 cartoonist. get_board_image ignores roughness",
  roundness: "Rounded corners or curves. Default false",
  opacity: "0 to 100, default 100",
  angle: "Rotation in radians (not degrees), default 0",
  fontSize:
    "Text elements, or the label of a rectangle/ellipse/diamond/arrow. Default 20; 16 small, 28 heading, 36 title",
  fontFamily:
    "Text elements or labels: 1 Virgil, 2 Helvetica, 3 Cascadia, 5 Excalifont (default), 6 Nunito, 7 Lilita One, 8 Comic Shanns, 9 Liberation Sans. get_board_image ignores fontFamily",
  textAlign:
    "Text elements or labels. Default left for text, center for labels",
  startArrowhead:
    "Arrows only. null for none (default), else arrow, bar, dot, triangle, diamond, ...",
  endArrowhead:
    "Arrows only. Default arrow; null for no head, else arrow, bar, dot, triangle, diamond, ...",
} satisfies Record<StyleKey, string>;

const styleField = (key: StyleKey): z.ZodTypeAny => {
  const field: (typeof STYLE)[StyleKey] = STYLE[key];
  let schema: z.ZodTypeAny;
  switch (field.kind) {
    case "color": {
      schema = z.string().max(32);
      break;
    }
    case "number": {
      schema = z.number().min(field.min).max(field.max);
      break;
    }
    case "flag": {
      schema = z.boolean();
      break;
    }
    default: {
      const literals = field.values.map((value) => z.literal(value));
      schema =
        typeof field.values[0] === "string"
          ? z.enum([...field.values] as [string, ...string[]])
          : z.union(
              literals as [
                z.ZodLiteral<string | number>,
                ...z.ZodLiteral<string | number>[],
              ]
            );
      if ("nullable" in field) {
        schema = schema.nullable();
      }
    }
  }
  return schema.optional().describe(STYLE_DOCS[key]);
};

/** Spread into `shape` and `patch`, so add, update and edit_selection cannot diverge. */
export const style = Object.fromEntries(
  STYLE_KEYS.map((key) => [key, styleField(key)])
) as { [K in StyleKey]: z.ZodType<Style[K] | undefined> };
