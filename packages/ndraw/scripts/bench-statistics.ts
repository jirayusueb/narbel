// Paired bootstrap intervals for bench-compare.ts. Approximate percentile intervals, not a mathematical guarantee:
// they make sparse per-run tails (cull, hit tests) read as noise unless the runs actually establish a difference.

export const BOOTSTRAP_RESAMPLES = 50_000;
export const BOOTSTRAP_SEED = 42;
/** joint coverage of every interval a comparison decides on */
export const FAMILY_CONFIDENCE = 0.95;

export interface ImprovementInterval {
  lower: number;
  upper: number;
  /** per-interval two-sided coverage, already Bonferroni-adjusted */
  confidence: number;
}

/** relative improvement, positive = better regardless of direction; ±Infinity when the base is 0 and the head is not */
export const improvementOf = (base: number, head: number, higherIsBetter: boolean) => {
  if (head === base) {
    return 0;
  }
  const delta = higherIsBetter ? head - base : base - head;
  return base === 0 ? Math.sign(delta) * Infinity : delta / base;
};

/** same definition as bench.ts: odd = middle value, even = mean of the middle pair */
const sortedMedian = (sorted: Float64Array) => {
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

export const median = (values: readonly number[]) => sortedMedian(Float64Array.from(values).sort());

/** per-interval confidence so `decisions` intervals hold jointly with >= FAMILY_CONFIDENCE (Bonferroni) */
export const bonferroni = (decisions: number) => 1 - (1 - FAMILY_CONFIDENCE) / Math.max(1, decisions);

// mulberry32, same generator as bench/fixture.ts (not imported: that module loads the built ndraw bundle)
const mulberry32 = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/**
 * Two-sided percentile interval of improvementOf(median(base), median(head)) under a paired bootstrap: each resample
 * draws run indices with replacement and takes the SAME indices from base and head, so the interleaved pairing (and the
 * machine drift it shares) is kept. Reseeded per call, so an interval does not depend on which rows came before it.
 */
export const pairedImprovementInterval = (
  base: readonly number[],
  head: readonly number[],
  higherIsBetter: boolean,
  confidence: number,
): ImprovementInterval => {
  const n = base.length;
  if (n === 0 || head.length !== n) {
    throw new Error(`paired samples need equal non-empty lengths, got ${n} and ${head.length}`);
  }
  if (![...base, ...head].every((v) => Number.isFinite(v) && v >= 0)) {
    throw new Error("paired samples must be finite and non-negative");
  }
  if (!(confidence > 0 && confidence < 1)) {
    throw new Error(`confidence must be inside (0, 1), got ${confidence}`);
  }
  if (base.every((v) => v === base[0]) && head.every((v) => v === head[0])) {
    // every resample has these medians, so the interval is exact
    const exact = improvementOf(base[0], head[0], higherIsBetter);
    return { lower: exact, upper: exact, confidence };
  }
  const random = mulberry32(BOOTSTRAP_SEED);
  const b = new Float64Array(n);
  const h = new Float64Array(n);
  const replicates = new Float64Array(BOOTSTRAP_RESAMPLES);
  for (let r = 0; r < BOOTSTRAP_RESAMPLES; r++) {
    for (let i = 0; i < n; i++) {
      const pick = Math.floor(random() * n);
      b[i] = base[pick];
      h[i] = head[pick];
    }
    replicates[r] = improvementOf(sortedMedian(b.sort()), sortedMedian(h.sort()), higherIsBetter);
  }
  replicates.sort();
  const tail = (1 - confidence) / 2;
  const last = BOOTSTRAP_RESAMPLES - 1;
  return { lower: replicates[Math.floor(tail * last)], upper: replicates[Math.ceil((1 - tail) * last)], confidence };
};
