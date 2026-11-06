import { restoreElements } from "@narbel/ndraw";
import type { ExcalidrawElement } from "../src/excalidraw/element/types";

export const SEED = 42;
export const SCENE_SIZE = 4000;
const CLUSTER_COUNT = 40;
const CLUSTER_SPREAD = 260;
const FREEDRAW_POINTS = 64;
const ARROW_GAP = 8;
const SHAPES = ["rectangle", "ellipse", "diamond"] as const;
const FONT_SIZE = 16;
const FONT_FAMILY = 5;
const LINE_HEIGHT = 1.25;

// mulberry32: small seeded PRNG so every run builds the same scene
export const mulberry32 = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/** kind of the i-th element inside each block of 1000: 560 shapes, 180 text, 120 lines, 60 arrows, 80 freedraw */
const kindOf = (i: number) => {
  const slot = i % 1000;
  if (slot < 560) {
    return "shape";
  }
  if (slot < 740) {
    return "text";
  }
  if (slot < 860) {
    return "line";
  }
  if (slot < 920) {
    return "arrow";
  }
  return "freedraw";
};

/** the fields the geometry helpers read; type-specific extras are Object.assign-ed on, restoreElements fills the rest */
interface Raw {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  seed: number;
  versionNonce: number;
  version: number;
  roughness: number;
  strokeColor: string;
  backgroundColor: string;
  fillStyle: string;
  boundElements: { id: string; type: "arrow" }[] | null;
}

interface Shape {
  raw: Raw;
  cluster: number;
}

export interface Fixture {
  elements: ExcalidrawElement[];
  /** scene point with the most elements around it */
  densest: { x: number; y: number };
}

/**
 * Deterministic scene: ids, seeds, positions and bindings depend only on (count, seed).
 * Elements are built as plain records and normalised once by restoreElements, so no Math.random is
 * involved; only `updated` carries a wall-clock timestamp. Arrows join two real shapes of the same cluster.
 */
export const buildFixture = (count: number, seed = SEED): Fixture => {
  const random = mulberry32(seed);
  const between = (min: number, max: number) => min + random() * (max - min);
  const int = () => Math.floor(random() * 2 ** 31);
  const clusters = Array.from({ length: CLUSTER_COUNT }, () => ({
    x: between(CLUSTER_SPREAD, SCENE_SIZE - CLUSTER_SPREAD),
    y: between(CLUSTER_SPREAD, SCENE_SIZE - CLUSTER_SPREAD),
  }));
  const place = () => {
    const cluster = Math.floor(random() * CLUSTER_COUNT);
    const c = clusters[cluster];
    return {
      cluster,
      x: c.x + (random() + random() + random() - 1.5) * CLUSTER_SPREAD * 1.4,
      y: c.y + (random() + random() + random() - 1.5) * CLUSTER_SPREAD * 1.4,
    };
  };
  const base = (id: string, type: string, x: number, y: number, width: number, height: number): Raw => ({
    id,
    type,
    x,
    y,
    width,
    height,
    seed: int(),
    versionNonce: int(),
    version: 1,
    roughness: 1,
    strokeColor: "#1e1e1e",
    backgroundColor: "transparent",
    fillStyle: "solid",
    boundElements: null,
  });

  const shapes: Shape[] = [];
  const byCluster: Shape[][] = clusters.map(() => []);
  const others: Raw[] = [];
  const arrowSlots: { id: string; at: { cluster: number; x: number; y: number } }[] = [];

  for (let i = 0; i < count; i++) {
    const id = `el-${i}`;
    const kind = kindOf(i);
    const at = place();
    if (kind === "shape") {
      const raw = base(id, SHAPES[i % SHAPES.length], at.x, at.y, between(20, 90), between(20, 90));
      raw.backgroundColor = i % 4 === 0 ? "#a5d8ff" : "transparent";
      raw.fillStyle = i % 8 === 0 ? "hachure" : "solid";
      const shape = { raw, cluster: at.cluster };
      shapes.push(shape);
      byCluster[at.cluster].push(shape);
    } else if (kind === "text") {
      const text = i % 2 === 0 ? `ทดสอบ ${i}` : `label ${i}`;
      // no DOM measuring here: 0.6em per character is what the server estimates too
      const raw = base(id, "text", at.x, at.y, text.length * FONT_SIZE * 0.6, FONT_SIZE * LINE_HEIGHT);
      Object.assign(raw, {
        text,
        originalText: text,
        fontSize: FONT_SIZE,
        fontFamily: FONT_FAMILY,
        lineHeight: LINE_HEIGHT,
        textAlign: "left",
        verticalAlign: "top",
        containerId: null,
        autoResize: true,
      });
      others.push(raw);
    } else if (kind === "line") {
      const points = [
        [0, 0],
        [between(-60, 60), between(-60, 60)],
        [between(-60, 60), between(-60, 60)],
      ];
      others.push(bounded(base(id, "line", at.x, at.y, 0, 0), points));
    } else if (kind === "arrow") {
      arrowSlots.push({ id, at });
    } else {
      let px = 0;
      let py = 0;
      const points: number[][] = [];
      for (let p = 0; p < FREEDRAW_POINTS; p++) {
        points.push([px, py]);
        px += between(-4, 6);
        py += between(-4, 6);
      }
      const raw = bounded(base(id, "freedraw", at.x, at.y, 0, 0), points);
      Object.assign(raw, { pressures: [], simulatePressure: true, lastCommittedPoint: null });
      others.push(raw);
    }
  }

  const arrows: Raw[] = [];
  for (const slot of arrowSlots) {
    const pool = byCluster.filter((c) => c.length >= 2);
    if (pool.length === 0) {
      break;
    }
    const near = byCluster[slot.at.cluster].length >= 2 ? byCluster[slot.at.cluster] : pool[Math.floor(random() * pool.length)];
    const a = near[Math.floor(random() * near.length)];
    let b = a;
    while (b === a) {
      b = near[Math.floor(random() * near.length)];
    }
    const [sx, sy, sFixed] = edgePoint(a.raw, b.raw);
    const [ex, ey, eFixed] = edgePoint(b.raw, a.raw);
    const arrow = bounded(
      Object.assign(base(slot.id, "arrow", sx, sy, 0, 0), {
        endArrowhead: "arrow",
        startArrowhead: null,
        elbowed: false,
        startBinding: { elementId: a.raw.id, focus: 0, gap: ARROW_GAP, fixedPoint: sFixed },
        endBinding: { elementId: b.raw.id, focus: 0, gap: ARROW_GAP, fixedPoint: eFixed },
      }),
      [
        [0, 0],
        [ex - sx, ey - sy],
      ],
    );
    a.raw.boundElements = [...(a.raw.boundElements ?? []), { id: slot.id, type: "arrow" }];
    b.raw.boundElements = [...(b.raw.boundElements ?? []), { id: slot.id, type: "arrow" }];
    arrows.push(arrow);
  }

  // shapes first, arrows last: bound text/arrows paint above what they join
  const raws = [...shapes.map((s) => s.raw), ...others, ...arrows];
  const elements = restoreElements(raws as unknown as ExcalidrawElement[], null) as ExcalidrawElement[];
  return { elements, densest: densestPoint(elements) };
};

/** sets points and a matching bbox so the element needs no later normalisation */
const bounded = (raw: Raw, points: number[][]): Raw => {
  let minX = 0;
  let minY = 0;
  let maxX = 0;
  let maxY = 0;
  for (const [x, y] of points) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return Object.assign(raw, { points, width: maxX - minX, height: maxY - minY });
};

/** point on the side of `from` that faces `toward`, pushed out by the binding gap, plus its fixedPoint ratio */
const edgePoint = (from: Raw, toward: Raw): [number, number, [number, number]] => {
  const dx = toward.x + toward.width / 2 - (from.x + from.width / 2);
  const dy = toward.y + toward.height / 2 - (from.y + from.height / 2);
  if (Math.abs(dx) * from.height > Math.abs(dy) * from.width) {
    const right = dx > 0;
    return [
      from.x + (right ? from.width + ARROW_GAP : -ARROW_GAP),
      from.y + from.height / 2,
      [right ? 1 : 0, 0.5],
    ];
  }
  const below = dy > 0;
  return [from.x + from.width / 2, from.y + (below ? from.height + ARROW_GAP : -ARROW_GAP), [0.5, below ? 1 : 0]];
};

const CELL = 200;
const densestPoint = (elements: readonly ExcalidrawElement[]) => {
  const cells = new Map<string, number>();
  let best = { key: "0,0", n: 0 };
  for (const el of elements) {
    const key = `${Math.floor((el.x + el.width / 2) / CELL)},${Math.floor((el.y + el.height / 2) / CELL)}`;
    const n = (cells.get(key) ?? 0) + 1;
    cells.set(key, n);
    if (n > best.n) {
      best = { key, n };
    }
  }
  const [cx, cy] = best.key.split(",").map(Number);
  return { x: (cx + 0.5) * CELL, y: (cy + 0.5) * CELL };
};

const MAX_ARROW_SPAN = CLUSTER_SPREAD * 6; // two shapes of one cluster are at most ~1.5k apart

/** throws unless the loaded scene has the planned mix and every arrow joins two real, nearby shapes */
export const assertFixture = (elements: readonly ExcalidrawElement[], count: number) => {
  const fail = (why: string): never => {
    throw new Error(`fixture invalid: ${why}`);
  };
  const byId = new Map(elements.map((e) => [e.id, e]));
  if (elements.length !== count || byId.size !== count) {
    fail(`expected ${count} unique ids, got ${elements.length}/${byId.size}`);
  }
  const tally: Record<string, number> = {};
  for (let i = 0; i < count; i++) {
    const kind = { shape: "shape", text: "text", line: "line", arrow: "arrow", freedraw: "freedraw" }[kindOf(i)];
    tally[kind] = (tally[kind] ?? 0) + 1;
  }
  const seen: Record<string, number> = {};
  for (const e of elements) {
    const kind = SHAPES.includes(e.type as (typeof SHAPES)[number]) ? "shape" : e.type;
    seen[kind] = (seen[kind] ?? 0) + 1;
    if (e.type === "image") {
      fail("fixture must not contain images");
    }
  }
  for (const kind of Object.keys(tally)) {
    // an arrow slot is dropped only when no cluster holds two shapes, which a 1k+ fixture never hits
    if (seen[kind] !== tally[kind]) {
      fail(`${kind}: expected ${tally[kind]}, got ${seen[kind] ?? 0}`);
    }
  }
  const thai = elements.filter((e) => e.type === "text" && /[\u0E00-\u0E7F]/.test((e as { text: string }).text)).length;
  if (thai * 2 !== (seen.text ?? 0)) {
    fail(`half of the ${seen.text} text elements must be Thai, got ${thai}`);
  }
  for (const e of elements) {
    if (e.type !== "arrow") {
      continue;
    }
    const arrow = e as ExcalidrawElement & { startBinding: { elementId: string } | null; endBinding: { elementId: string } | null; points: number[][] };
    const a = arrow.startBinding && byId.get(arrow.startBinding.elementId);
    const b = arrow.endBinding && byId.get(arrow.endBinding.elementId);
    if (!a || !b || a === b || !SHAPES.includes(a.type as (typeof SHAPES)[number]) || !SHAPES.includes(b.type as (typeof SHAPES)[number])) {
      fail(`arrow ${e.id} is not bound to two distinct shapes`);
    }
    const span = Math.hypot(a!.x - b!.x, a!.y - b!.y);
    if (span > MAX_ARROW_SPAN) {
      fail(`arrow ${e.id} spans ${Math.round(span)} units between its shapes`);
    }
    for (const s of [a!, b!]) {
      if (!s.boundElements?.some((x) => x.id === e.id)) {
        fail(`shape ${s.id} does not list arrow ${e.id}`);
      }
    }
  }
};
