import type { SceneElement } from "../entities/SceneElement";
import {
  box,
  elementBounds,
  geometryBox,
  isLinear,
  num,
  pointsOf,
  rotatedBounds,
  union,
} from "../rules/geometry";
import type { Bounds, Point } from "../rules/geometry";
import { STYLE } from "../shapes/ElementStyle";

// RenderBoardImage still imports Bounds from here
export type { Bounds } from "../rules/geometry";

export const FONT_FAMILY = "Sarabun";
export const DEFAULT_MAX_SIZE = 1600;
export const MIN_MAX_SIZE = 256;
export const MAX_MAX_SIZE = 4096;
const MAX_PIXELS = 8_000_000;
const PADDING = 40;
const LABEL_PADDING = 5;
const ARROW_LABEL_PADDING = 4;
const BACKGROUND = "#ffffff";
const DEFAULT_LINE_HEIGHT = 1.25;
const ARROWHEAD_BASE = 14;

export interface ImageData {
  mimeType: string;
  base64: string;
}

export interface SceneSvg {
  svg: string;
  /** pixel size the svg renders at */
  width: number;
  height: number;
  /** content bounds in board coordinates, without padding */
  bounds: Bounds;
}

const str = (value: unknown, fallback: string) =>
  typeof value === "string" && value !== "" ? value : fallback;
const round = (n: number) => Math.round(n * 100) / 100;

export const escapeXml = (value: string) =>
  value.replaceAll(/[<>&"']/gu, (c) => `&#${c.codePointAt(0)};`);

const DASH: Record<string, (w: number) => string> = {
  dashed: (w) => `${w * 4} ${w * 3}`,
  dotted: (w) => `${w} ${w * 2.5}`,
};

const strokeAttrs = (e: SceneElement) => {
  const width = Math.max(num(e.strokeWidth, 1), 0.5);
  const dash = DASH[String(e.strokeStyle)]?.(width);
  return (
    `stroke="${escapeXml(str(e.strokeColor, STYLE.strokeColor.default))}" stroke-width="${width}"` +
    ` stroke-linecap="round" stroke-linejoin="round"${
      dash ? ` stroke-dasharray="${dash}"` : ""
    }`
  );
};

const fillAttr = (e: SceneElement) => {
  const color = str(e.backgroundColor, "transparent");
  return `fill="${color === "transparent" ? "none" : escapeXml(color)}"`;
};

const shapeStyle = (e: SceneElement) => `${fillAttr(e)} ${strokeAttrs(e)}`;

const cornerRadius = (e: SceneElement) => {
  if (!e.roundness) {
    return 0;
  }
  const side = Math.min(num(e.width), num(e.height));
  return Math.min(side * 0.25, 32);
};

const path = (pts: Point[], smooth: boolean) => {
  const [first = [0, 0], ...rest] = pts;
  const last = rest.at(-1) ?? first;
  let d = `M${first.join(" ")}`;
  if (!smooth || rest.length < 2) {
    return d + rest.map((p) => `L${p.join(" ")}`).join("");
  }
  // quadratic curves through segment midpoints keep corners soft like Excalidraw's round lines
  for (let i = 0; i < rest.length - 1; i += 1) {
    const [cx, cy] = rest[i] as Point;
    const [nx, ny] = rest[i + 1] as Point;
    d += `Q${cx} ${cy} ${(cx + nx) / 2} ${(cy + ny) / 2}`;
  }
  return `${d}L${last.join(" ")}`;
};

const arrowhead = (
  kind: string,
  tip: Point,
  from: Point,
  e: SceneElement
): string => {
  const dx = tip[0] - from[0];
  const dy = tip[1] - from[1];
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const size = ARROWHEAD_BASE + num(e.strokeWidth, 2) * 2;
  const back: Point = [tip[0] - ux * size, tip[1] - uy * size];
  const left: Point = [back[0] - uy * size * 0.45, back[1] + ux * size * 0.45];
  const right: Point = [back[0] + uy * size * 0.45, back[1] - ux * size * 0.45];
  const color = escapeXml(str(e.strokeColor, STYLE.strokeColor.default));
  const stroke = strokeAttrs({ ...e, strokeStyle: "solid" });
  const poly = (pts: Point[], fill: string) =>
    `<polygon points="${pts.map((p) => p.join(",")).join(" ")}" fill="${fill}" ${stroke}/>`;
  switch (kind) {
    case "triangle":
    case "triangle_outline": {
      return poly([tip, left, right], kind === "triangle" ? color : "#ffffff");
    }
    case "bar": {
      const wing = size * 0.5;
      return `<line x1="${tip[0] - uy * wing}" y1="${tip[1] + ux * wing}" x2="${tip[0] + uy * wing}" y2="${tip[1] - ux * wing}" ${stroke}/>`;
    }
    case "dot":
    case "circle":
    case "circle_outline": {
      const r = size * 0.35;
      return `<circle cx="${tip[0] - ux * r}" cy="${tip[1] - uy * r}" r="${r}" fill="${kind === "circle_outline" ? "#ffffff" : color}" ${stroke}/>`;
    }
    case "diamond":
    case "diamond_outline": {
      const mid: Point = [tip[0] - ux * size * 0.5, tip[1] - uy * size * 0.5];
      const tail: Point = [tip[0] - ux * size, tip[1] - uy * size];
      const half = size * 0.3;
      return poly(
        [
          tip,
          [mid[0] - uy * half, mid[1] + ux * half],
          tail,
          [mid[0] + uy * half, mid[1] - ux * half],
        ],
        kind === "diamond" ? color : "#ffffff"
      );
    }
    default: {
      return `<polyline points="${[left, tip, right].map((p) => p.join(",")).join(" ")}" fill="none" ${stroke}/>`;
    }
  }
};

const linear = (e: SceneElement): string => {
  const pts = pointsOf(e).map(([px, py]): Point => [
    num(e.x) + px,
    num(e.y) + py,
  ]);
  if (e.type === "freedraw") {
    return `<path d="${path(pts, false)}" fill="none" ${strokeAttrs(e)}/>`;
  }
  const closed = e.type === "line" && e.polygon === true && pts.length > 2;
  const body = `<path d="${path(pts, Boolean(e.roundness))}${closed ? "Z" : ""}" ${closed ? fillAttr(e) : 'fill="none"'} ${strokeAttrs(e)}/>`;
  if (e.type !== "arrow") {
    return body;
  }
  const heads = [
    [
      e.endArrowhead === undefined
        ? STYLE.endArrowhead.default
        : e.endArrowhead,
      pts.at(-1),
      pts.at(-2),
    ],
    [e.startArrowhead, pts[0], pts[1]],
  ] as const;
  return (
    body +
    heads
      .filter(([kind, tip, from]) => typeof kind === "string" && tip && from)
      .map(([kind, tip, from]) =>
        arrowhead(String(kind), tip as Point, from as Point, e)
      )
      .join("")
  );
};

interface TextArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

const LEFT = { anchor: "start", share: 0 };
const ALIGN: Record<string, { anchor: string; share: number }> = {
  left: LEFT,
  center: { anchor: "middle", share: 0.5 },
  right: { anchor: "end", share: 1 },
};
const VERTICAL_SHARE: Record<string, number> = { middle: 0.5, bottom: 1 };

const textNode = (e: SceneElement, area: TextArea) => {
  const lines = String(e.text ?? "").split("\n");
  const fontSize = num(e.fontSize, STYLE.fontSize.default);
  const lineHeight = fontSize * num(e.lineHeight, DEFAULT_LINE_HEIGHT);
  const align = ALIGN[String(e.textAlign)] ?? LEFT;
  const x = area.x + area.width * align.share;
  const total = lines.length * lineHeight;
  const top =
    area.y +
    (area.height - total) * (VERTICAL_SHARE[String(e.verticalAlign)] ?? 0);
  const color = escapeXml(str(e.strokeColor, STYLE.strokeColor.default));
  const tspans = lines
    .map(
      (line, i) =>
        `<tspan x="${round(x)}" y="${round(top + i * lineHeight + lineHeight / 2)}">${escapeXml(line)}</tspan>`
    )
    .join("");
  return `<text font-family="${FONT_FAMILY}" font-size="${fontSize}" fill="${color}" text-anchor="${align.anchor}" dominant-baseline="central" xml:space="preserve">${tspans}</text>`;
};

const label = (e: SceneElement, container: SceneElement) => {
  const c = box(container);
  return textNode(e, {
    x: c.x + LABEL_PADDING,
    y: c.y + LABEL_PADDING,
    width: c.width - LABEL_PADDING * 2,
    height: c.height - LABEL_PADDING * 2,
  });
};

const imageNode = (e: SceneElement, images: Map<string, ImageData>) => {
  const b = box(e);
  const data = typeof e.fileId === "string" ? images.get(e.fileId) : undefined;
  if (!data) {
    return (
      `<rect x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" fill="#f1f3f5" stroke="#adb5bd" stroke-width="2" stroke-dasharray="8 6"/>` +
      `<path d="M${b.x} ${b.y}L${b.x + b.width} ${b.y + b.height}M${b.x + b.width} ${b.y}L${b.x} ${b.y + b.height}" stroke="#adb5bd" stroke-width="2"/>`
    );
  }
  const [sx, sy] = Array.isArray(e.scale) ? (e.scale as number[]) : [1, 1];
  const flip =
    sx === -1 || sy === -1
      ? ` transform="translate(${b.x + b.width / 2} ${b.y + b.height / 2}) scale(${sx === -1 ? -1 : 1} ${sy === -1 ? -1 : 1}) translate(${-(b.x + b.width / 2)} ${-(b.y + b.height / 2)})"`
      : "";
  return `<image x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" preserveAspectRatio="none"${flip} href="data:${escapeXml(data.mimeType)};base64,${data.base64}"/>`;
};

const shapeNode = (e: SceneElement, images: Map<string, ImageData>) => {
  const b = box(e);
  switch (e.type) {
    case "rectangle": {
      const r = cornerRadius(e);
      return `<rect x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" rx="${r}" ry="${r}" ${shapeStyle(e)}/>`;
    }
    case "ellipse": {
      return `<ellipse cx="${b.x + b.width / 2}" cy="${b.y + b.height / 2}" rx="${b.width / 2}" ry="${b.height / 2}" ${shapeStyle(e)}/>`;
    }
    case "diamond": {
      const mx = b.x + b.width / 2;
      const my = b.y + b.height / 2;
      return `<polygon points="${mx},${b.y} ${b.x + b.width},${my} ${mx},${b.y + b.height} ${b.x},${my}" ${shapeStyle(e)}/>`;
    }
    case "frame":
    case "magicframe": {
      const name = escapeXml(str(e.name, ""));
      return `<rect x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" fill="none" stroke="#b0b0b0" stroke-width="1.5"/>${
        name
          ? `<text x="${b.x}" y="${b.y - 8}" font-family="${FONT_FAMILY}" font-size="14" fill="#6b6b6b">${name}</text>`
          : ""
      }`;
    }
    case "line":
    case "arrow":
    case "freedraw": {
      return linear(e);
    }
    case "image": {
      return imageNode(e, images);
    }
    default: {
      return "";
    }
  }
};

const byZOrder = (a: SceneElement, b: SceneElement) => {
  const ai = typeof a.index === "string" ? a.index : undefined;
  const bi = typeof b.index === "string" ? b.index : undefined;
  if (ai === bi) {
    return a.id < b.id ? -1 : 1;
  }
  if (ai === undefined || bi === undefined) {
    return ai === undefined ? 1 : -1;
  }
  return ai < bi ? -1 : 1;
};

/** The shape a label sits centered in; a connector's label is placed on its own box instead. */
const boxContainer = (e: SceneElement, byId: Map<string, SceneElement>) => {
  const container =
    typeof e.containerId === "string" ? byId.get(e.containerId) : undefined;
  return container && !isLinear(container) ? container : undefined;
};

const element = (
  e: SceneElement,
  byId: Map<string, SceneElement>,
  images: Map<string, ImageData>
) => {
  const container = boxContainer(e, byId);
  let inner: string;
  if (e.type !== "text") {
    inner = shapeNode(e, images);
  } else if (container) {
    inner = label(e, container);
  } else {
    const own = box(e);
    const host = byId.get(String(e.containerId));
    // like Excalidraw, an arrow's label hides the line behind it
    inner =
      (host && isLinear(host)
        ? `<rect x="${round(own.x - ARROW_LABEL_PADDING)}" y="${round(own.y - ARROW_LABEL_PADDING)}" width="${round(own.width + ARROW_LABEL_PADDING * 2)}" height="${round(own.height + ARROW_LABEL_PADDING * 2)}" fill="${BACKGROUND}"/>`
        : "") + textNode(e, own);
  }
  if (inner === "") {
    return "";
  }
  const b = container ? box(container) : geometryBox(e);
  const angle = num(container ? container.angle : e.angle);
  const opacity = num(e.opacity, 100) / 100;
  const attrs =
    (angle === 0
      ? ""
      : ` transform="rotate(${round((angle * 180) / Math.PI)} ${round(b.x + b.width / 2)} ${round(b.y + b.height / 2)})"`) +
    (opacity < 1 ? ` opacity="${opacity}"` : "");
  return attrs === "" ? inner : `<g${attrs}>${inner}</g>`;
};

const drawnBounds = (e: SceneElement, byId: Map<string, SceneElement>) => {
  const container = boxContainer(e, byId);
  // a box label never extends past its container, whose own box already counts
  return container
    ? rotatedBounds(container, box(container))
    : elementBounds(e);
};

const clampSize = (maxSize: number | undefined) =>
  Math.min(
    Math.max(Math.round(maxSize ?? DEFAULT_MAX_SIZE), MIN_MAX_SIZE),
    MAX_MAX_SIZE
  );

/**
 * Draws one page as a standalone SVG sized so its long side is `maxSize` pixels, or null
 * when the page has nothing to draw. Elements must carry every label's container.
 */
export const buildSceneSvg = (
  elements: SceneElement[],
  images: Map<string, ImageData>,
  maxSize?: number
): SceneSvg | null => {
  const live = elements.filter((e) => !e.isDeleted);
  live.sort(byZOrder);
  const byId = new Map(live.map((e) => [e.id, e]));
  const drawn = live.filter(
    (e) =>
      e.type !== "text" || !e.containerId || byId.has(String(e.containerId))
  );
  const nodes = drawn.map((e) => ({ e, node: element(e, byId, images) }));
  const visible = nodes.filter((n) => n.node !== "");
  if (visible.length === 0) {
    return null;
  }
  const bounds = union(visible.map(({ e }) => drawnBounds(e, byId)));
  const viewW = bounds.width + PADDING * 2;
  const viewH = bounds.height + PADDING * 2;
  const target = clampSize(maxSize);
  const longSide = Math.max(viewW, viewH);
  const budget =
    Math.sqrt(MAX_PIXELS / (viewW * viewH)) * Math.min(viewW, viewH);
  const scale = Math.min(target / longSide, budget / Math.min(viewW, viewH));
  const width = Math.max(1, Math.round(viewW * scale));
  const height = Math.max(1, Math.round(viewH * scale));
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${round(bounds.x - PADDING)} ${round(bounds.y - PADDING)} ${round(viewW)} ${round(viewH)}">` +
    `<rect x="${round(bounds.x - PADDING)}" y="${round(bounds.y - PADDING)}" width="${round(viewW)}" height="${round(viewH)}" fill="${BACKGROUND}"/>${visible
      .map((n) => n.node)
      .join("")}</svg>`;
  return { svg, width, height, bounds };
};
