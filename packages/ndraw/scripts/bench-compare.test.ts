import { describe, expect, test } from "bun:test";
import { compare, type BenchFile, type Comparison, type MetricSummary } from "./bench-compare";

const timing = (p95: number): MetricSummary => ({ p50: p95 / 2, p95, p99: p95, count: 100 });
const total = (n: number): MetricSummary => ({ p50: n, p95: n, p99: n, count: n });
const fps = (p50: number): MetricSummary => ({ p50, p95: p50, p99: p50, count: 300 });

const file = (scenarios: Record<string, Record<string, MetricSummary>>, over: Partial<BenchFile> = {}): BenchFile => ({
  schema: 1,
  fixture: { count: 10_000, seed: 42 },
  runs: 15,
  machine: { cpu: "m", platform: "darwin", arch: "arm64" },
  scenarios: Object.fromEntries(Object.entries(scenarios).map(([name, median]) => [name, {
    median,
    runs: Array.from({ length: over.runs ?? 15 }, () => median),
  }])),
  ...over,
});

const rowOf = (r: Comparison, scenario: string, metric: string) => r.rows.find((x) => x.scenario === scenario && x.metric === metric);

describe("direction", () => {
  test("lower fps is a regression, lower timing is an improvement", () => {
    const r = compare(file({ pan: { fps: fps(60), staticRender: timing(10) } }), file({ pan: { fps: fps(50), staticRender: timing(5) } }));
    expect(rowOf(r, "pan", "fps")?.status).toBe("regressed");
    expect(rowOf(r, "pan", "staticRender")?.status).toBe("improved");
    expect(r.failed).toBe(true);
  });
  test("a 4% slowdown is inside the 5% limit, 6% is not", () => {
    expect(compare(file({ pan: { cull: timing(10) } }), file({ pan: { cull: timing(10.4) } })).failed).toBe(false);
    expect(compare(file({ pan: { cull: timing(10) } }), file({ pan: { cull: timing(10.6) } })).failed).toBe(true);
  });
});

describe("zero and missing", () => {
  test("0 -> 0 counters are unchanged, not missing", () => {
    const r = compare(file({ pan: { longTask: total(0) } }), file({ pan: { longTask: total(0) } }));
    expect(rowOf(r, "pan", "longTask")?.status).toBe("ok");
    expect(r.failed).toBe(false);
  });
  test("0 -> 2 long tasks is a regression", () => {
    expect(compare(file({ pan: { longTask: total(0) } }), file({ pan: { longTask: total(2) } })).failed).toBe(true);
  });
  test("a gate cannot pass from a zero base", () => {
    const r = compare(file({ pan: { longTask: total(0), staticRender: timing(10) }, zoom: { longTask: total(0) } }), file({ pan: { longTask: total(0), staticRender: timing(10) }, zoom: { longTask: total(0) } }), { pr: 7 });
    expect(r.gates.every((g) => !g.ok)).toBe(true);
    expect(r.gates[0].detail).toContain("is 0");
  });
  test("a metric dropped from head fails, a new one does not", () => {
    const r = compare(file({ pan: { cull: timing(5) } }), file({ pan: { tileComposite: total(9) } }));
    expect(rowOf(r, "pan", "cull")?.status).toBe("missing");
    expect(rowOf(r, "pan", "tileComposite")?.status).toBe("new");
  });
});

describe("gates", () => {
  const base = file({ zoom: { elementCanvasRegen: total(1000), staticRender: timing(20) } });
  test("PR5 needs the owner-anchored >=30% fewer regenerations", () => {
    const pass = compare(base, file({ zoom: { elementCanvasRegen: total(680), staticRender: timing(10) } }), { pr: 5 });
    expect(pass.gates.map((g) => g.ok)).toEqual([true, true]);
    const fail = compare(base, file({ zoom: { elementCanvasRegen: total(760), staticRender: timing(10) } }), { pr: 5 });
    expect(fail.gates[0].ok).toBe(false);
    expect(fail.failed).toBe(true);
  });
  test("PR9 maxValue-free gate fails when the metric is missing in head", () => {
    const r = compare(file({ hover: { bindingHover: timing(4), hitTestPoint: timing(1) } }), file({ hover: { hitTestPoint: timing(1) } }), { pr: 9 });
    expect(r.gates[0].ok).toBe(false);
  });
  test("worker metrics may grow without tripping the global rule", () => {
    const r = compare(file({ pan: { tileRasterWorkerMs: total(0) } }), file({ pan: { tileRasterWorkerMs: total(400) } }));
    expect(r.failed).toBe(false);
  });
  test("PR 3 needs a faster cull, an unchanged one fails", () => {
    expect(compare(file({ pan: { cull: timing(5) } }), file({ pan: { cull: timing(5) } }), { pr: 3 }).failed).toBe(true);
    expect(compare(file({ pan: { cull: timing(5) } }), file({ pan: { cull: timing(4) } }), { pr: 3 }).failed).toBe(false);
  });
  test("PR 8 fails while contendedDrag is absent", () => {
    const r = compare(file({ pan: { cull: timing(5) } }), file({ pan: { cull: timing(5) } }), { pr: 8 });
    expect(r.gates.every((g) => !g.ok)).toBe(true);
  });
});

describe("incomparable files", () => {
  const a = file({ pan: { cull: timing(5) } });
  test.each([
    ["fixture size", file({ pan: { cull: timing(5) } }, { fixture: { count: 1000, seed: 42 } })],
    ["seed", file({ pan: { cull: timing(5) } }, { fixture: { count: 10_000, seed: 7 } })],
    ["machine", file({ pan: { cull: timing(5) } }, { machine: { cpu: "other", platform: "darwin", arch: "arm64" } })],
    ["unpaired run counts", file({ pan: { cull: timing(5) } }, { runs: 3 })],
    ["scenario dropped from head", file({ zoom: { cull: timing(5) } })],
    ["platform", file({ pan: { cull: timing(5) } }, { machine: { cpu: "m", platform: "linux", arch: "arm64" } })],
    ["partial metric in head", { ...file({ pan: { cull: timing(5) } }), scenarios: { pan: { median: { cull: timing(5) }, partial: ["cull"] } } }],
  ])("%s", (_name, other) => {
    const r = compare(a, other);
    expect(r.incomparable.length).toBeGreaterThan(0);
    expect(r.rows).toEqual([]);
  });
  test("different Chrome builds are rejected, an unknown one is not", () => {
    const withChrome = (chrome?: string) => file({ pan: { cull: timing(5) } }, { machine: { cpu: "m", platform: "darwin", arch: "arm64", chrome } });
    expect(compare(withChrome("Chrome/150"), withChrome("Chrome/151")).incomparable.length).toBe(1);
    expect(compare(withChrome("Chrome/150"), withChrome()).incomparable).toEqual([]);
  });
  test("a scenario only head has is not required", () => {
    expect(compare(a, file({ pan: { cull: timing(5) }, zoom: { cull: timing(5) } })).incomparable).toEqual([]);
  });
  test("a gate rejects the old three-pair sample even when every metric improves", () => {
    const base = file({ pan: { cull: timing(5) } }, { runs: 3 });
    const head = file({ pan: { cull: timing(1) } }, { runs: 3 });
    const result = compare(base, head, { pr: 3 });
    expect(result.failed).toBe(true);
    expect(result.incomparable).toContain("gates require at least 15 paired runs");
  });
  test("a PR with no gates and no neutral note is rejected", () => {
    expect(compare(a, a, { pr: 2 }).incomparable[0]).toContain("no gates");
  });
});

const sampledFile = (values: readonly number[]): BenchFile => {
  const sorted = [...values].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  return {
    ...file({ pan: { cull: timing(median) } }),
    scenarios: {
      pan: {
        median: { cull: timing(median) },
        runs: values.map((value) => ({ cull: timing(value) })),
      },
    },
  };
};

describe("uncertain paired measurements", () => {
  const base = sampledFile([10, 11, 9, 10, 10, 11, 9, 10, 10, 11, 9, 10, 10, 11, 9]);
  const noisy = sampledFile([6, 13, 8, 14, 12, 7, 15, 7, 13, 8, 12, 8, 12, 8, 12]);

  test("does not call a noisy point-estimate slowdown a proven regression", () => {
    const result = compare(base, noisy);
    expect(rowOf(result, "pan", "cull")?.improvement).toBeLessThan(-0.05);
    expect(rowOf(result, "pan", "cull")?.status).toBe("inconclusive");
    expect(result.failed).toBe(false);
  });

  test("still blocks a required improvement that the samples do not establish", () => {
    const result = compare(noisy, base, { pr: 3 });
    expect(result.failed).toBe(true);
    expect(result.gates[0].ok).toBe(false);
    expect(result.gates[0].detail).toContain("inconclusive");
  });
});

describe("paired evidence and safety assertions", () => {
  const values = Array.from({ length: 15 }, (_, index) => (index + 1) * 100);

  test("proves a consistent ten-percent regression despite correlated workload variation", () => {
    const result = compare(sampledFile(values), sampledFile(values.map((value) => value * 1.1)));
    expect(rowOf(result, "pan", "cull")?.status).toBe("regressed");
    expect(result.failed).toBe(true);
  });

  test("proves a consistent target improvement from the same paired workloads", () => {
    const result = compare(sampledFile(values), sampledFile(values.map((value) => value * 0.6)), { pr: 3 });
    expect(result.gates[0].ok).toBe(true);
    expect(result.failed).toBe(false);
  });

  test("does not hide one drag deviation behind a zero median", () => {
    const base = file({ contendedDrag: { pointerJumps: total(0), maxDragDeviation: timing(0) } });
    const head = file({ contendedDrag: { pointerJumps: total(0), maxDragDeviation: timing(0) } });
    const { runs } = head.scenarios.contendedDrag;
    Reflect.set(head.scenarios.contendedDrag, "runs", runs.map((run, index) =>
      index === 7 ? { ...run, maxDragDeviation: timing(0.25) } : run,
    ));
    const result = compare(base, head, { pr: 8 });
    expect(result.failed).toBe(true);
    expect(result.gates.find((entry) => entry.gate.metric === "maxDragDeviation")?.ok).toBe(false);
  });

  test("rejects summary-only data instead of silently falling back to point estimates", () => {
    const base = sampledFile(values);
    const head = sampledFile(values);
    Reflect.deleteProperty(head.scenarios.pan, "runs");
    const result = compare(base, head);
    expect(result.failed).toBe(true);
    expect(result.incomparable.length).toBeGreaterThan(0);
  });

  test("rejects raw observations that do not match the advertised pair count", () => {
    const base = sampledFile(values);
    const head = sampledFile(values);
    Reflect.set(head.scenarios.pan, "runs", []);
    const result = compare(base, head);
    expect(result.failed).toBe(true);
    expect(result.incomparable.length).toBeGreaterThan(0);
  });
});
