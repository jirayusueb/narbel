import type { Element } from "../entities/element";

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type Point = [number, number];

export class Geometry {
  private constructor() {
    // static rules only
  }

  static num(value: unknown, fallback = 0) {
    return typeof value === "number" && Number.isFinite(value)
      ? value
      : fallback;
  }

  static pointsOf(e: Element): Point[] {
    return e.points && e.points.length > 0
      ? e.points.map(([px, py]) => [Geometry.num(px), Geometry.num(py)])
      : [
          [0, 0],
          [Geometry.num(e.width), Geometry.num(e.height)],
        ];
  }

  static isLinear(e: Element) {
    return e.type === "line" || e.type === "arrow" || e.type === "freedraw";
  }

  private static box(e: Element): Bounds {
    return {
      x: Geometry.num(e.x),
      y: Geometry.num(e.y),
      width: Geometry.num(e.width),
      height: Geometry.num(e.height),
    };
  }

  static geometryBox(e: Element): Bounds {
    if (!Geometry.isLinear(e)) {
      return Geometry.box(e);
    }
    const pts = Geometry.pointsOf(e);
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    return {
      x: Geometry.num(e.x) + minX,
      y: Geometry.num(e.y) + minY,
      width: Math.max(...xs) - minX,
      height: Math.max(...ys) - minY,
    };
  }

  static rotatedBounds(e: Element, b: Bounds): Bounds {
    const angle = Geometry.num(e.angle);
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
  }

  static elementBounds(e: Element): Bounds {
    return Geometry.rotatedBounds(e, Geometry.geometryBox(e));
  }

  static union(boxes: Bounds[]): Bounds {
    const minX = Math.min(...boxes.map((b) => b.x));
    const minY = Math.min(...boxes.map((b) => b.y));
    return {
      x: minX,
      y: minY,
      width: Math.max(...boxes.map((b) => b.x + b.width)) - minX,
      height: Math.max(...boxes.map((b) => b.y + b.height)) - minY,
    };
  }

  static overlaps(a: Bounds, b: Bounds) {
    return (
      a.x <= b.x + b.width &&
      a.x + a.width >= b.x &&
      a.y <= b.y + b.height &&
      a.y + a.height >= b.y
    );
  }

  /**
   * Where a connector's label sits, in board coordinates (Excalidraw's rule): the middle
   * point of an odd point count, the midpoint of the middle segment of an even one.
   */
  static polylineMidpoint(e: Element): { x: number; y: number } {
    const pts = Geometry.pointsOf(e);
    const mid = Math.floor(pts.length / 2);
    const [bx, by] = pts[mid] as Point;
    const [ax, ay] = pts.length % 2 === 1 ? [bx, by] : (pts[mid - 1] as Point);
    return {
      x: Geometry.num(e.x) + (ax + bx) / 2,
      y: Geometry.num(e.y) + (ay + by) / 2,
    };
  }
}
