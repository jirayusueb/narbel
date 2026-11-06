// Perf gates, one list per PR of the ndraw engine plan. Every gate is evaluated at the 10k fixture over the interleaved
// runs: a target must be proven by its paired bootstrap interval (bench-compare.ts), a maxValue must hold in every head
// run, and every other metric fails only when a regression beyond 5% is statistically established.

export type Stat = "p50" | "p95" | "p99" | "count";

export interface Gate {
  pr: number;
  scenario: string;
  metric: string;
  /** required relative improvement of the head over the base: 0.4 = 40% better, 0 = strictly better */
  minImprovement?: number;
  /** alternative to minImprovement: the head's value itself must not exceed this */
  maxValue?: number;
  note?: string;
}

export const GATE_FIXTURE = 10_000;
export const GATE_RUNS = 15;
export const MAX_REGRESSION = 0.05;

/** metrics that are event/work totals: compared on `count`, which the perf report fills with the total */
const COUNTERS = new Set([
  "longTask",
  "elementCanvasRegen",
  "tileComposite",
  "pointerJumps",
  "tileRasterMainMs",
  "tileRasterWorkerMs",
]);

/** work that a later PR moves on purpose (more composites, raster on the worker), so growth is not a regression */
export const EXPECTED_TO_GROW = new Set(["tileComposite", "tileRasterWorkerMs"]);

export interface MetricRule {
  stat: Stat;
  higherIsBetter: boolean;
}

/** fps is a rate (p95, higher is better); counters compare totals; everything else is a timing (p95, lower is better) */
export const ruleFor = (metric: string): MetricRule => {
  if (metric === "fps") {
    return { stat: "p95", higherIsBetter: true };
  }
  if (COUNTERS.has(metric)) {
    return { stat: "count", higherIsBetter: false };
  }
  return { stat: "p95", higherIsBetter: false };
};

export const GATES: Gate[] = [
  // PR 3 (signals): the plan gives no number but requires proof it is faster; conservative bar is any cull improvement
  { pr: 3, scenario: "pan", metric: "cull", minImprovement: 0 },
  // PR 4 (spatial index): the plan sets no PR4 number; the indexed hit-test queries must get faster.
  // Culling stays linear (measured): a pan viewport covers ~20% of the clustered scene and the
  // index query is slower than the loop, so cull has no gate and must simply not regress.
  { pr: 4, scenario: "hover", metric: "hitTestPoint", minImprovement: 0 },
  { pr: 4, scenario: "boxSelect", metric: "hitTestBox", minImprovement: 0 },
  // PR 5 (LOD): >=30% fewer element raster regenerations across the zoom wave+staircase, and static render must get faster.
  // Re-anchored from the plan's 80% by the owner: regen volume scales with the elements visible at each band
  // crossing, and upstream's shouldCacheIgnoreZoom already coalesces wheel-zoom regens, so 80% is unattainable.
  { pr: 5, scenario: "zoom", metric: "elementCanvasRegen", minImprovement: 0.3 },
  { pr: 5, scenario: "zoom", metric: "staticRender", minImprovement: 0 },
  // PR 6 (tiles): pan static render p95 >=40% better
  { pr: 6, scenario: "pan", metric: "staticRender", minImprovement: 0.4 },
  // PR 7 (worker): >=50% fewer long tasks; pan staticRender must not regress (covered by the global rule)
  { pr: 7, scenario: "pan", metric: "longTask", minImprovement: 0.5 },
  { pr: 7, scenario: "zoom", metric: "longTask", minImprovement: 0.5 },
  // PR 8 (sync smoothing): owner re-anchored from "0 moves >24px" after measurement: a peer teleport still reaches
  // ~40px in the frame the cursor reverses (base engine: 400px in one frame). Every run's per-frame cursor step
  // (60Hz-normalised, p95) must stay <= 60px, and the local drag must track the pointer exactly.
  { pr: 8, scenario: "contendedDrag", metric: "maxPointerStep", maxValue: 60 },
  { pr: 8, scenario: "contendedDrag", metric: "maxDragDeviation", maxValue: 0 },
  // PR 9: owner re-anchored twice from 50% after measurement. PR 4 already took bindingHover +93%;
  // the rest is flatbush traversal + border tests. The tightened pad, the empty-delta fast path and
  // the parallel element array measure 31.2% [14.3, 54.5]; p95 of ~89 hover samples is noisy, so the
  // gate asks for the CI-provable 10%.
  { pr: 9, scenario: "hover", metric: "bindingHover", minImprovement: 0.1 },
];
