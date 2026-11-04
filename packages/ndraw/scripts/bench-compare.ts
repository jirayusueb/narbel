// bun scripts/bench-compare.ts <base.json> <head.json> [--pr N]
// exit 0 = pass, 1 = a gate or the no-regression rule failed, 2 = the two files cannot be compared
import { EXPECTED_TO_GROW, GATES, GATE_FIXTURE, MAX_REGRESSION, ruleFor, type Gate, type Stat } from "./bench-gates";

export interface MetricSummary {
  p50: number;
  p95: number;
  p99: number;
  count: number;
}
export type Report = Record<string, MetricSummary>;

export interface BenchFile {
  schema: 1;
  fixture: { count: number; seed: number };
  runs: number;
  machine: { cpu: string; platform: string; arch: string; chrome?: string };
  /** partial lists metrics that were absent from some runs, so their median covers fewer runs */
  scenarios: Record<string, { median: Report; partial?: string[] }>;
}

export type Status = "ok" | "improved" | "regressed" | "new" | "missing" | "incomparable";

export interface Row {
  scenario: string;
  metric: string;
  stat: Stat;
  base?: number;
  head?: number;
  /** relative improvement, positive = better regardless of direction; Infinity when the base is 0 and the head is worse/better */
  improvement?: number;
  status: Status;
  note?: string;
}

export interface GateResult {
  gate: Gate;
  ok: boolean;
  detail: string;
}

export interface Comparison {
  /** why the files cannot be compared at all; everything else is empty then */
  incomparable: string[];
  rows: Row[];
  gates: GateResult[];
  failed: boolean;
}

const improvementOf = (base: number, head: number, higherIsBetter: boolean) => {
  if (head === base) {
    return 0;
  }
  const delta = higherIsBetter ? head - base : base - head;
  return base === 0 ? Math.sign(delta) * Infinity : delta / base;
};

const compareMetric = (scenario: string, metric: string, base: MetricSummary | undefined, head: MetricSummary | undefined): Row => {
  const { stat, higherIsBetter } = ruleFor(metric);
  const row: Row = { scenario, metric, stat, base: base?.[stat], head: head?.[stat], status: "ok" };
  if (!base) {
    return { ...row, status: "new", note: "not in base" };
  }
  if (!head) {
    return { ...row, status: "missing", note: "in base but not in head" };
  }
  const values = [base[stat], head[stat]];
  if (values.some((v) => typeof v !== "number" || !Number.isFinite(v) || v < 0)) {
    return { ...row, status: "incomparable", note: "non-finite or negative value" };
  }
  row.improvement = improvementOf(base[stat], head[stat], higherIsBetter);
  if (row.improvement < -MAX_REGRESSION && !EXPECTED_TO_GROW.has(metric)) {
    row.status = "regressed";
  } else if (row.improvement > 0) {
    row.status = "improved";
  }
  return row;
};

const checkGate = (gate: Gate, rows: Row[]): GateResult => {
  const row = rows.find((r) => r.scenario === gate.scenario && r.metric === gate.metric);
  const fail = (detail: string) => ({ gate, ok: false, detail });
  if (gate.maxValue !== undefined) {
    if (row?.head === undefined) {
      return fail("metric missing in head");
    }
    return { gate, ok: row.head <= gate.maxValue, detail: `head ${row.stat}=${row.head}, allowed <= ${gate.maxValue}` };
  }
  const need = gate.minImprovement ?? 0;
  if (!row || row.base === undefined || row.head === undefined) {
    return fail("metric missing in base or head, so it cannot be compared");
  }
  if (row.status === "incomparable") {
    return fail(row.note ?? "incomparable");
  }
  if (row.base === 0) {
    return fail(`base ${row.stat} is 0: a relative improvement is undefined, fix the scenario or the metric`);
  }
  const got = row.improvement ?? 0;
  const ok = need === 0 ? got > 0 : got >= need;
  return { gate, ok, detail: `${(got * 100).toFixed(1)}% better (${row.base} -> ${row.head}), need ${need === 0 ? ">0" : `>=${need * 100}`}%` };
};

export const compare = (base: BenchFile, head: BenchFile, opts: { pr?: number } = {}): Comparison => {
  const incomparable: string[] = [];
  if (base.schema !== 1 || head.schema !== 1) {
    incomparable.push("unknown file schema");
  }
  if (base.fixture.count !== head.fixture.count || base.fixture.seed !== head.fixture.seed) {
    incomparable.push(`fixtures differ: ${JSON.stringify(base.fixture)} vs ${JSON.stringify(head.fixture)}`);
  }
  if (base.machine.cpu !== head.machine.cpu || base.machine.arch !== head.machine.arch) {
    incomparable.push(`machines differ: ${base.machine.cpu} vs ${head.machine.cpu}`);
  }
  if (opts.pr !== undefined && base.fixture.count !== GATE_FIXTURE) {
    incomparable.push(`gates are defined at the ${GATE_FIXTURE} fixture, files hold ${base.fixture.count}`);
  }
  if (base.machine.platform !== head.machine.platform) {
    incomparable.push(`platforms differ: ${base.machine.platform} vs ${head.machine.platform}`);
  }
  if (base.machine.chrome && head.machine.chrome && base.machine.chrome !== head.machine.chrome) {
    incomparable.push(`browsers differ: ${base.machine.chrome} vs ${head.machine.chrome}`);
  }
  const names = Object.keys(base.scenarios);
  if (names.length === 0) {
    incomparable.push("base holds no scenario");
  }
  for (const scenario of names) {
    if (!(scenario in head.scenarios)) {
      incomparable.push(`scenario ${scenario} is in base but missing in head`);
    }
    for (const [label, file] of [["base", base], ["head", head]] as const) {
      const partial = file.scenarios[scenario]?.partial ?? [];
      if (partial.length > 0) {
        incomparable.push(`${label} ${scenario}: ${partial.join(", ")} missing from some runs, median is not comparable`);
      }
    }
  }
  if (incomparable.length > 0) {
    return { incomparable, rows: [], gates: [], failed: true };
  }

  const rows: Row[] = [];
  for (const scenario of names) {
    const b = base.scenarios[scenario].median;
    const h = head.scenarios[scenario].median;
    for (const metric of new Set([...Object.keys(b), ...Object.keys(h)])) {
      rows.push(compareMetric(scenario, metric, b[metric], h[metric]));
    }
  }
  const gates = opts.pr === undefined ? [] : GATES.filter((g) => g.pr === opts.pr).map((g) => checkGate(g, rows));
  const known = opts.pr === undefined || gates.length > 0;
  if (!known) {
    incomparable.push(`no gates are defined for PR ${opts.pr}`);
  }
  const failed = incomparable.length > 0 || gates.some((g) => !g.ok) || rows.some((r) => r.status === "regressed" || r.status === "missing" || r.status === "incomparable");
  return { incomparable, rows, gates, failed };
};

const pct = (r: Row) => (r.improvement === undefined ? "-" : Number.isFinite(r.improvement) ? `${(r.improvement * 100).toFixed(1)}%` : r.improvement > 0 ? "+inf" : "-inf");

const print = (result: Comparison) => {
  for (const reason of result.incomparable) {
    console.log(`INCOMPARABLE: ${reason}`);
  }
  if (result.rows.length > 0) {
    console.table(
      result.rows.map((r) => ({ scenario: r.scenario, metric: r.metric, stat: r.stat, base: r.base, head: r.head, "better by": pct(r), status: r.status + (r.note ? ` (${r.note})` : "") }))
    );
  }
  for (const g of result.gates) {
    console.log(`${g.ok ? "PASS" : "FAIL"} gate PR${g.gate.pr} ${g.gate.scenario}/${g.gate.metric}: ${g.detail}`);
  }
  console.log(result.failed ? "RESULT: FAIL" : "RESULT: PASS");
};

if (import.meta.main) {
  const args = process.argv.slice(2);
  const flag = (name: string) => {
    const at = args.indexOf(name);
    return at === -1 ? undefined : args.splice(at, 2)[1];
  };
  const pr = flag("--pr");
  const [basePath, headPath] = args;
  if (!basePath || !headPath) {
    console.error("usage: bun scripts/bench-compare.ts <base.json> <head.json> [--pr N]");
    process.exit(2);
  }
  const result = compare(await Bun.file(basePath).json(), await Bun.file(headPath).json(), {
    pr: pr === undefined ? undefined : Number(pr),
  });
  print(result);
  process.exit(result.incomparable.length > 0 ? 2 : result.failed ? 1 : 0);
}
