// Perf gates, one list per PR of the ndraw engine plan. Every gate is evaluated at the 10k fixture
// from medians over the interleaved runs, and on top of them every other metric may regress by at most 5%.

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
  // PR 4 (spatial index): plan gives no number, so each indexed query must simply get faster
  { pr: 4, scenario: "hover", metric: "hitTestPoint", minImprovement: 0 },
  { pr: 4, scenario: "boxSelect", metric: "hitTestBox", minImprovement: 0 },
  { pr: 4, scenario: "pan", metric: "cull", minImprovement: 0 },
  // PR 5 (LOD): >=80% fewer element raster regenerations across a zoom wave, and static render must get faster
  { pr: 5, scenario: "zoom", metric: "elementCanvasRegen", minImprovement: 0.8 },
  { pr: 5, scenario: "zoom", metric: "staticRender", minImprovement: 0 },
  // PR 6 (tiles): pan static render p95 >=40% better
  { pr: 6, scenario: "pan", metric: "staticRender", minImprovement: 0.4 },
  // PR 7 (worker): >=50% fewer long tasks; pan staticRender must not regress (covered by the global rule)
  { pr: 7, scenario: "pan", metric: "longTask", minImprovement: 0.5 },
  { pr: 7, scenario: "zoom", metric: "longTask", minImprovement: 0.5 },
  // PR 8 (sync smoothing): scenario "contendedDrag" arrives with PR 8; until then these gates fail as missing, on purpose
  { pr: 8, scenario: "contendedDrag", metric: "pointerJumps", maxValue: 0 },
  { pr: 8, scenario: "contendedDrag", metric: "maxDragDeviation", maxValue: 0 },
  // PR 9 (index-accelerated binding search): bindingHover p95 >=50% better
  { pr: 9, scenario: "hover", metric: "bindingHover", minImprovement: 0.5 },
];
