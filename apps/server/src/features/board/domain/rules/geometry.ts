import type { SceneElement } from "../entities/SceneElement";

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type Point = [number, number];

export const num = (value: unknown, fallback = 0) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

export const pointsOf = (e: SceneElement): Point[] =>
  Array.isArray(e.points) && e.points.length > 0
    ? (e.points as Point[]).map(([px, py]) => [num(px), num(py)])
    : [
        [0, 0],
        [num(e.width), num(e.height)],
      ];

export const isLinear = (e: SceneElement) =>
  e.type === "line" || e.type === "arrow" || e.type === "freedraw";

const box = (e: SceneElement): Bounds => ({
  x: num(e.x),
  y: num(e.y),
  width: num(e.width),
  height: num(e.height),
});

export const geometryBox = (e: SceneElement): Bounds => {
  if (!isLinear(e)) {
    return box(e);
  }
  const pts = pointsOf(e);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return {
    x: num(e.x) + minX,
    y: num(e.y) + minY,
    width: Math.max(...xs) - minX,
    height: Math.max(...ys) - minY,
  };
};

export const rotatedBounds = (e: SceneElement, b: Bounds): Bounds => {
  const angle = num(e.angle);
  if (angle === 0) {
    return b;
  }
  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const corners = (
    [
      [b.x, b.y],
      [b.x + b.width, b.y],
      [b.x, b.y + b.height],
      [b.x + b.width, b.y + b.height],
    ] as Point[]
  ).map(([px, py]) => ({
    x: cx + (px - cx) * cos - (py - cy) * sin,
    y: cy + (px - cx) * sin + (py - cy) * cos,
  }));
  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  return {
    x: Math.min(...xs),
    y: Math.min(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
};

export const elementBounds = (e: SceneElement): Bounds =>
  rotatedBounds(e, geometryBox(e));

export const union = (boxes: Bounds[]): Bounds => {
  const minX = Math.min(...boxes.map((b) => b.x));
  const minY = Math.min(...boxes.map((b) => b.y));
  return {
    x: minX,
    y: minY,
    width: Math.max(...boxes.map((b) => b.x + b.width)) - minX,
    height: Math.max(...boxes.map((b) => b.y + b.height)) - minY,
  };
};

export const overlaps = (a: Bounds, b: Bounds) =>
  a.x <= b.x + b.width &&
  a.x + a.width >= b.x &&
  a.y <= b.y + b.height &&
  a.y + a.height >= b.y;

/**
 * Where a connector's label sits, in board coordinates (Excalidraw's rule): the middle
 * point of an odd point count, the midpoint of the middle segment of an even one.
 */
export const polylineMidpoint = (e: SceneElement): { x: number; y: number } => {
  const pts = pointsOf(e);
  const mid = Math.floor(pts.length / 2);
  const [bx, by] = pts[mid] as Point;
  const [ax, ay] = pts.length % 2 === 1 ? [bx, by] : (pts[mid - 1] as Point);
  return { x: num(e.x) + (ax + bx) / 2, y: num(e.y) + (ay + by) / 2 };
};
