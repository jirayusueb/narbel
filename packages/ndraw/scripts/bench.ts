// bun scripts/bench.ts --fixture 10000 --scenario pan --runs 15 --out head.json [--against <base ndraw dir or worktree>]
//
// Needs `bun run build` in packages/ndraw (and in the --against checkout) first: the page bundles the shipped
// dist/prod through the "@narbel/ndraw" root import, never the sources.
//
// --against interleaves two builds in ONE Chrome session: per scenario, run r measures base then head (head then
// base on odd runs), each in a fresh tab, so machine drift hits both sides equally. Base writes to --base-out
// (default: --out with ".base" before the extension). Feed the two files to bench-compare.ts.
//
// Flags: --fixture N (default 10000)  --scenario pan|zoom|hover|boxSelect|remoteBatch|contendedDrag|all|a,b (default pan)
//        --runs N (15)  --out path  --base-out path  --against dir  --profile dir (/tmp/ndraw-bench-chrome)
//        --screenshot dir (one PNG per run, after the scenario)  --headed  CHROME_PATH env for the browser
import { cpus, totalmem } from "node:os";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { chromium, type BrowserContext } from "playwright-core";
import type { BenchFile, MetricSummary, Report } from "./bench-compare";
import { GATE_RUNS } from "./bench-gates";

const SEED = 42; // keep equal to bench/fixture.ts
const STATS = ["p50", "p95", "p99", "count"] as const;
const DEFAULT_CHROME = "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary";
const LOAD_TIMEOUT_MS = 300_000;
const WARMUP_RUNS = 1; // runOnce performs exactly one discarded pass per measured pass
const SCENARIO_TIMEOUT_MS = 120_000;

/** scenario name -> page driver call */
const SCENARIOS = {
  pan: { fn: "pan", arg: 5000 },
  zoom: { fn: "zoomWave", arg: undefined },
  hover: { fn: "hoverPath", arg: 3000 },
  boxSelect: { fn: "boxSelect", arg: undefined },
  remoteBatch: { fn: "remoteBatch", arg: 200 },
  contendedDrag: { fn: "contendedDrag", arg: undefined },
} as const;
type ScenarioName = keyof typeof SCENARIOS;

/** what bench/main.tsx puts on window; only used to type the evaluate callbacks, which run in the page */
interface BenchPage {
  __benchReady: Promise<void>;
  __bench: Record<string, (arg?: number) => Promise<unknown>>;
}

interface Target {
  label: "head" | "base";
  /** packages/ndraw of the checkout being measured */
  root: string;
  sha: string;
}

const benchDir = path.join(import.meta.dirname, "..", "bench");
const headRoot = path.resolve(import.meta.dirname, "..");

const args = process.argv.slice(2);
const option = (name: string) => {
  const at = args.indexOf(name);
  return at === -1 ? undefined : args[at + 1];
};
const fixture = Number(option("--fixture") ?? 10_000);
const runs = Number(option("--runs") ?? GATE_RUNS);
const wanted = option("--scenario") ?? "pan";
const scenarios = (wanted === "all" ? Object.keys(SCENARIOS) : wanted.split(",")) as ScenarioName[];
const unknown = scenarios.filter((s) => !(s in SCENARIOS));
if (unknown.length > 0 || !Number.isInteger(fixture) || fixture < 1 || !Number.isInteger(runs) || runs < 1) {
  console.error(`bad arguments: scenarios ${Object.keys(SCENARIOS).join("|")}|all, --fixture and --runs positive integers`);
  process.exit(2);
}
const out = option("--out");
const against = option("--against");
const baseOut = option("--base-out") ?? (out && against ? out.replace(/(\.json)?$/, ".base$1") : undefined);
const profile = option("--profile") ?? "/tmp/ndraw-bench-chrome";
const shotDir = option("--screenshot");
const log = (message: string) => console.error(`[bench] ${message}`);

const ndrawDir = (given: string) => {
  const dir = existsSync(path.join(given, "packages/ndraw")) ? path.join(given, "packages/ndraw") : given;
  if (!existsSync(path.join(dir, "dist/prod/index.js"))) {
    throw new Error(`${dir}/dist/prod/index.js is missing: run "bun run build" in that packages/ndraw first`);
  }
  return path.resolve(dir);
};
const gitSha = (dir: string) => Bun.spawnSync(["git", "rev-parse", "--short", "HEAD"], { cwd: dir }).stdout.toString().trim() || "unknown";

const targets: Target[] = [{ label: "head", root: ndrawDir(headRoot), sha: gitSha(headRoot) }];
if (against) {
  targets.unshift({ label: "base", root: ndrawDir(against), sha: gitSha(against) });
}
const results = new Map<string, Map<ScenarioName, Report[]>>(targets.map((t) => [t.label, new Map()]));

// one bundle of the SAME bench sources per target, resolving "@narbel/ndraw" to that target's dist and
// react to a single copy (head's), so the only difference between base and head is the engine build
const buildRoot = `/tmp/ndraw-bench-build-${process.pid}`;
rmSync(buildRoot, { recursive: true, force: true });
for (const t of targets) {
  const outdir = path.join(buildRoot, t.label);
  const build = await Bun.build({
    entrypoints: [path.join(benchDir, "main.tsx")],
    outdir,
    target: "browser",
    minify: true,
    naming: "[name].[ext]",
    define: { "process.env.NODE_ENV": '"production"' },
    plugins: [
      {
        name: "ndraw-bench-resolve",
        setup(b) {
          b.onResolve({ filter: /^@narbel\/ndraw$/ }, () => ({ path: path.join(t.root, "dist/prod/index.js") }));
          b.onResolve({ filter: /^@narbel\/ndraw\/index\.css$/ }, () => ({ path: path.join(t.root, "dist/prod/index.css") }));
          b.onResolve({ filter: /^react(-dom)?(\/.*)?$/ }, (r) => ({ path: Bun.resolveSync(r.path, headRoot) }));
        },
      },
    ],
  });
  if (!build.success) {
    throw new Error(`bundling the bench against ${t.root} failed:\n${build.logs.join("\n")}`);
  }
  await Bun.write(path.join(outdir, "index.html"), Bun.file(path.join(benchDir, "index.html")));
}

const server = Bun.serve({
  port: 0,
  hostname: "127.0.0.1",
  fetch(req) {
    const [, label, ...rest] = new URL(req.url).pathname.split("/");
    const target = targets.find((t) => t.label === label);
    const rel = rest.join("/") || "index.html";
    if (!target || rel.split("/").includes("..")) {
      return new Response("not found", { status: 404 });
    }
    const file = rel.startsWith("dist/")
      ? Bun.file(path.join(target.root, "dist/prod", rel.slice("dist/".length)))
      : Bun.file(path.join(buildRoot, label, rel));
    return file.size > 0 || rel === "index.html"
      ? new Response(file, { headers: {
          "cache-control": "no-store",
          // Non-isolated Chrome rounds timings to 0.1ms, swamping sub-ms 5% gates.
          "cross-origin-opener-policy": "same-origin",
          "cross-origin-embedder-policy": "require-corp",
        } })
      : new Response("not found", { status: 404 });
  },
});

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const medianReport = (reports: Report[]) => {
  const names = new Set(reports.flatMap((r) => Object.keys(r)));
  const medians: Report = {};
  const partial: string[] = [];
  for (const name of names) {
    const present = reports.filter((r) => name in r);
    if (present.length < reports.length) {
      partial.push(name);
    }
    medians[name] = Object.fromEntries(STATS.map((s) => [s, median(present.map((r) => r[name][s]))])) as unknown as MetricSummary;
  }
  return { median: medians, partial };
};

const withTimeout = async <T>(work: Promise<T>, ms: number, what: string) => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${what} timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
};

let chromeVersion = "unknown";
const executablePath = process.env.CHROME_PATH ?? DEFAULT_CHROME;
if (!existsSync(executablePath)) {
  throw new Error(`no browser at ${executablePath}: set CHROME_PATH`);
}
mkdirSync(profile, { recursive: true });
const context: BrowserContext = await chromium.launchPersistentContext(profile, {
  executablePath,
  headless: !args.includes("--headed"),
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 1,
  args: ["--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows", "--no-first-run"],
});

const runOnce = async (target: Target, scenario: ScenarioName, run: number) => {
  const { fn, arg } = SCENARIOS[scenario];
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.stack ?? String(e)));
  try {
    await page.goto(`http://127.0.0.1:${server.port}/${target.label}/?ndraw-perf`, { waitUntil: "load" });
    chromeVersion = await page.evaluate(() => navigator.userAgent);
    if (!(await page.evaluate(() => crossOriginIsolated))) {
      throw new Error("benchmark requires cross-origin isolation for high-resolution timings");
    }
    await withTimeout(page.evaluate(() => (window as unknown as BenchPage).__benchReady), 30_000, "editor start");
    const loaded = await withTimeout(page.evaluate((n) => (window as unknown as BenchPage).__bench.load(n), fixture), LOAD_TIMEOUT_MS, "fixture load");
    log(`${target.label} ${scenario} run ${run + 1}/${runs}: loaded ${JSON.stringify(loaded)}`);
    // unmeasured warmup (JIT, shape/raster caches, font and layout work): same driver, result discarded, then the
    // same seeded fixture is loaded again so the measured pass starts from identical scene and interaction state
    await withTimeout(
      page.evaluate(([name, a]) => (window as unknown as BenchPage).__bench[name](a), [fn, arg] as const),
      SCENARIO_TIMEOUT_MS,
      `${scenario} warmup`,
    );
    await withTimeout(page.evaluate((n) => (window as unknown as BenchPage).__bench.load(n), fixture), LOAD_TIMEOUT_MS, "fixture reload after warmup");
    const report = (await withTimeout(
      page.evaluate(([name, a]) => (window as unknown as BenchPage).__bench[name](a), [fn, arg] as const),
      SCENARIO_TIMEOUT_MS,
      `${scenario} driver`,
    )) as Report;
    if (shotDir) {
      mkdirSync(shotDir, { recursive: true });
      await page.screenshot({ path: path.join(shotDir, `${target.label}-${scenario}-${run + 1}.png`) });
    }
    if (errors.length > 0) {
      throw new Error(`page errors in ${target.label}/${scenario}:\n${errors.join("\n")}`);
    }
    if (!report || Object.keys(report).length === 0) {
      throw new Error(`${target.label} produced an empty perf report: its dist has no perf instrumentation or the page ran without ?ndraw-perf`);
    }
    return report;
  } finally {
    await page.close();
  }
};

const fileFor = (target: Target): BenchFile & Record<string, unknown> => {
  const scenarioData: BenchFile["scenarios"] = {};
  for (const scenario of scenarios) {
    const reports = results.get(target.label)!.get(scenario)!;
    const { median: med, partial } = medianReport(reports);
    scenarioData[scenario] = { median: med, runs: reports, partial };
  }
  return {
    schema: 1,
    label: target.label,
    root: target.root,
    sha: target.sha,
    createdAt: new Date().toISOString(),
    fixture: { count: fixture, seed: SEED },
    runs,
    warmupRuns: WARMUP_RUNS,
    crossOriginIsolated: true,
    machine: {
      cpu: cpus()[0]?.model ?? "unknown",
      cores: cpus().length,
      memGB: Math.round(totalmem() / 2 ** 30),
      platform: process.platform,
      arch: process.arch,
      bun: Bun.version,
      chrome: chromeVersion,
      chromePath: executablePath,
    },
    scenarios: scenarioData,
  };
};

try {
  for (const scenario of scenarios) {
    for (const t of targets) {
      results.get(t.label)!.set(scenario, []);
    }
    for (let run = 0; run < runs; run++) {
      const order = run % 2 === 0 ? targets : [...targets].reverse();
      for (const t of order) {
        results.get(t.label)!.get(scenario)!.push(await runOnce(t, scenario, run));
      }
    }
    for (const t of targets) {
      const { median: med, partial } = medianReport(results.get(t.label)!.get(scenario)!);
      console.log(JSON.stringify({ target: t.label, sha: t.sha, scenario, fixture, runs, median: med, partial }));
    }
  }
  for (const t of targets) {
    const file = fileFor(t);
    const dest = t.label === "base" ? baseOut : out;
    if (dest) {
      await Bun.write(dest, `${JSON.stringify(file, null, 2)}\n`);
      log(`wrote ${dest}`);
    }
  }
} finally {
  await context.close();
  server.stop(true);
  rmSync(buildRoot, { recursive: true, force: true });
}
