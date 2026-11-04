// bun scripts/bench-compare.ts <base.json> <head.json> [--pr N]
// exit 0 = pass, 1 = a gate failed or was not proven, or a regression beyond 5% is statistically established,
// 2 = the two files cannot be compared.
//
// Point estimates are the medians of the per-run stats, as before. Decisions use paired bootstrap intervals of the
// median-ratio improvement (bench-statistics.ts), Bonferroni-adjusted so all of a comparison's decisions hold jointly
// at >= 95%: a target must be proven past its threshold, while a non-target metric fails only when its interval lies
// entirely beyond the 5% regression limit. A noise-overlapped non-target row is "inconclusive" and does not block, so
// a small real regression can hide inside noise; the summary line reports how many rows that applies to.
import { EXPECTED_TO_GROW, GATES, GATE_FIXTURE, GATE_RUNS, MAX_REGRESSION, ruleFor, type Gate, type Stat } from "./bench-gates";
import {
  BOOTSTRAP_RESAMPLES,
  BOOTSTRAP_SEED,
  FAMILY_CONFIDENCE,
  bonferroni,
  improvementOf,
  median,
  pairedImprovementInterval,
  type ImprovementInterval,
} from "./bench-statistics";

export interface MetricSummary {
  p50: number;
  p95: number;
  p99: number;
  count: number;
}
export type Report = Record<string, MetricSummary>;

export interface ScenarioData {
  median: Report;
  /** one report per measured run, in run order; base and head run r were interleaved in the same session */
  runs: Report[];
  /** metrics that were absent from some runs, so their median covers fewer runs */
  partial?: string[];
}

export interface BenchFile {
  schema: 1;
  fixture: { count: number; seed: number };
  runs: number;
  machine: { cpu: string; platform: string; arch: string; chrome?: string };
  scenarios: Record<string, ScenarioData>;
}

/** inconclusive = the interval straddles the 5% regression limit: reported, not blocking */
export type Status = "ok" | "improved" | "inconclusive" | "regressed" | "new" | "missing" | "incomparable";

export interface Row {
  scenario: string;
  metric: string;
  stat: Stat;
  base?: number;
  head?: number;
  /** point estimate from the medians: positive = better regardless of direction; ±Infinity when the base is 0 */
  improvement?: number;
  /** paired bootstrap interval of the improvement, present on every comparable row */
  interval?: ImprovementInterval;
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
  /** intervals the Bonferroni family covers: non-target comparable rows plus the PR's improvement gates */
  decisions: number;
  failed: boolean;
}

const validNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;

const pct = (v: number) => (Number.isFinite(v) ? `${(v * 100).toFixed(1)}%` : v > 0 ? "+inf" : "-inf");

/** raw runs back every median: wrong length, absent runs or a missing/invalid stat make the file incomparable */
const checkRuns = (label: string, file: BenchFile, incomparable: string[]) => {
  for (const [scenario, data] of Object.entries(file.scenarios)) {
    const partial = data?.partial ?? [];
    if (partial.length > 0) {
      incomparable.push(`${label} ${scenario}: ${partial.join(", ")} missing from some runs, median is not comparable`);
    }
    const runs: unknown = data?.runs;
    if (typeof data?.median !== "object" || data.median === null || !Array.isArray(runs) || runs.length !== file.runs) {
      incomparable.push(`${label} ${scenario}: needs a median and exactly ${file.runs} raw runs, found ${Array.isArray(runs) ? runs.length : "none"}`);
      continue;
    }
    const reports = runs as Report[];
    const metrics = new Set([...Object.keys(data.median), ...reports.flatMap((r) => Object.keys(r ?? {}))]);
    const bad = [...metrics].filter((m) => !(m in data.median) || reports.some((r) => !validNumber(r?.[m]?.[ruleFor(m).stat])));
    if (bad.length > 0) {
      incomparable.push(`${label} ${scenario}: ${bad.join(", ")} not a finite non-negative value in the median and every raw run`);
    }
  }
};

/** point row plus its paired raw samples when both sides can be compared */
const pointRow = (scenario: string, metric: string, base: ScenarioData, head: ScenarioData): { row: Row; samples?: [number[], number[]] } => {
  const { stat, higherIsBetter } = ruleFor(metric);
  const b = base.median[metric]?.[stat];
  const h = head.median[metric]?.[stat];
  const row: Row = { scenario, metric, stat, base: b, head: h, status: "ok" };
  if (!(metric in base.median)) {
    return { row: { ...row, status: "new", note: "not in base" } };
  }
  if (!(metric in head.median)) {
    return { row: { ...row, status: "missing", note: "in base but not in head" } };
  }
  if (!validNumber(b) || !validNumber(h)) {
    return { row: { ...row, status: "incomparable", note: "non-finite or negative value" } };
  }
  const samples: [number[], number[]] = [base.runs.map((r) => r[metric][stat]), head.runs.map((r) => r[metric][stat])];
  if (median(samples[0]) !== b || median(samples[1]) !== h) {
    return { row: { ...row, status: "incomparable", note: "median does not match the raw runs" } };
  }
  return { row: { ...row, improvement: improvementOf(b, h, higherIsBetter) }, samples };
};

const classify = (metric: string, { lower, upper }: ImprovementInterval): Status => {
  if (EXPECTED_TO_GROW.has(metric) || lower >= -MAX_REGRESSION) {
    return lower > 0 ? "improved" : "ok";
  }
  return upper < -MAX_REGRESSION ? "regressed" : "inconclusive";
};

const checkGate = (gate: Gate, rows: Row[], head: BenchFile): GateResult => {
  const fail = (detail: string) => ({ gate, ok: false, detail });
  const max = gate.maxValue;
  if (max !== undefined) {
    // exact bound: every raw run must satisfy it, one violation must not vanish inside a median
    const { stat } = ruleFor(gate.metric);
    const values = (head.scenarios[gate.scenario]?.runs ?? []).map((r) => r?.[gate.metric]?.[stat]);
    if (values.length === 0 || !values.every(validNumber)) {
      return fail("metric missing in head, or invalid in some head run");
    }
    const over = values.flatMap((v, i) => (v > max ? [`run ${i + 1}: ${v}`] : []));
    return over.length === 0
      ? { gate, ok: true, detail: `all ${values.length} head runs have ${stat} <= ${max}` }
      : fail(`head ${stat} must be <= ${max} in every run; ${over.join(", ")}`);
  }
  const need = gate.minImprovement ?? 0;
  const row = rows.find((r) => r.scenario === gate.scenario && r.metric === gate.metric);
  if (!row || row.base === undefined || row.head === undefined) {
    return fail("metric missing in base or head, so it cannot be compared");
  }
  if (row.status === "incomparable" || !row.interval) {
    return fail(row.note ?? "incomparable");
  }
  if (row.base === 0) {
    return fail(`base ${row.stat} is 0: a relative improvement is undefined, fix the scenario or the metric`);
  }
  const { lower, upper, confidence } = row.interval;
  const proven = need === 0 ? lower > 0 : lower >= need;
  const refuted = need === 0 ? upper <= 0 : upper < need;
  const verdict = proven ? "proven" : refuted ? "not met" : "inconclusive, the interval straddles the target so it is not proven";
  const detail =
    `${pct(row.improvement ?? 0)} better (${row.base} -> ${row.head}), need ${need === 0 ? ">0" : `>=${need * 100}`}%, ` +
    `${(confidence * 100).toFixed(2)}% CI [${pct(lower)}, ${pct(upper)}]: ${verdict}`;
  return { gate, ok: proven, detail };
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
  if (base.runs !== head.runs) {
    incomparable.push(`run counts differ: ${base.runs} vs ${head.runs}`);
  }
  if (opts.pr !== undefined && (base.runs < GATE_RUNS || head.runs < GATE_RUNS)) {
    incomparable.push(`gates require at least ${GATE_RUNS} paired runs`);
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
  }
  checkRuns("base", base, incomparable);
  checkRuns("head", head, incomparable);
  if (incomparable.length > 0) {
    return { incomparable, rows: [], gates: [], decisions: 0, failed: true };
  }

  const points = names.flatMap((scenario) => {
    const b = base.scenarios[scenario];
    const h = head.scenarios[scenario];
    return [...new Set([...Object.keys(b.median), ...Object.keys(h.median)])].map((metric) => pointRow(scenario, metric, b, h));
  });
  const prGates = opts.pr === undefined ? [] : GATES.filter((g) => g.pr === opts.pr);
  const decisions =
    points.filter((p) => p.samples && !EXPECTED_TO_GROW.has(p.row.metric)).length + prGates.filter((g) => g.maxValue === undefined).length;
  const confidence = bonferroni(decisions);
  const rows = points.map(({ row, samples }) => {
    if (!samples) {
      return row;
    }
    const interval = pairedImprovementInterval(samples[0], samples[1], ruleFor(row.metric).higherIsBetter, confidence);
    return { ...row, interval, status: classify(row.metric, interval) };
  });
  const gates = prGates.map((g) => checkGate(g, rows, head));
  if (opts.pr !== undefined && gates.length === 0) {
    incomparable.push(`no gates are defined for PR ${opts.pr}`);
  }
  const failed = incomparable.length > 0 || gates.some((g) => !g.ok) || rows.some((r) => r.status === "regressed" || r.status === "missing" || r.status === "incomparable");
  return { incomparable, rows, gates, decisions, failed };
};

const print = (result: Comparison) => {
  for (const reason of result.incomparable) {
    console.log(`INCOMPARABLE: ${reason}`);
  }
  if (result.rows.length > 0) {
    console.table(
      result.rows.map((r) => ({
        scenario: r.scenario,
        metric: r.metric,
        stat: r.stat,
        base: r.base,
        head: r.head,
        "better by": r.improvement === undefined ? "-" : pct(r.improvement),
        interval: r.interval ? `[${pct(r.interval.lower)}, ${pct(r.interval.upper)}]` : "-",
        status: r.status + (r.note ? ` (${r.note})` : ""),
      })),
    );
    const per = bonferroni(result.decisions);
    console.log(
      `intervals: paired percentile bootstrap of the median ratio, ${BOOTSTRAP_RESAMPLES} resamples, seed ${BOOTSTRAP_SEED}, ` +
        `${(per * 100).toFixed(2)}% each so ${result.decisions} decisions hold jointly at >= ${FAMILY_CONFIDENCE * 100}% (Bonferroni); approximate, not a guarantee`,
    );
  }
  for (const g of result.gates) {
    console.log(`${g.ok ? "PASS" : "FAIL"} gate PR${g.gate.pr} ${g.gate.scenario}/${g.gate.metric}: ${g.detail}`);
  }
  if (result.failed) {
    console.log("RESULT: FAIL");
    return;
  }
  const inconclusive = result.rows.filter((r) => r.status === "inconclusive").length;
  console.log(
    `RESULT: PASS: ${result.gates.length > 0 ? "required targets proven" : "no required targets"}; ` +
      `no statistically demonstrated >${MAX_REGRESSION * 100}% regression; ${inconclusive} ancillary inconclusive` +
      (inconclusive > 0 ? " (noise overlaps the limit, a small real regression there is not ruled out)" : ""),
  );
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
