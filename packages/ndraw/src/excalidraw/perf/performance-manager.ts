// Records timings and counters for the bench harness. Inert unless the page opts in
// with ?ndraw-perf or window.__NDRAW_PERF = true before the editor loads.

const RING_SIZE = 512;

declare global {
  interface Window {
    __NDRAW_PERF?: boolean;
  }
}

export interface MetricSummary {
  count: number;
  p50: number;
  p95: number;
  p99: number;
}

export type PerfReport = Record<string, MetricSummary>;

class Ring {
  readonly samples = new Float64Array(RING_SIZE);
  count = 0;

  push(value: number) {
    this.samples[this.count % RING_SIZE] = value;
    this.count++;
  }

  summary(): MetricSummary {
    const held = this.samples.slice(0, Math.min(this.count, RING_SIZE)).sort();
    const at = (q: number) =>
      held.length === 0 ? 0 : held[Math.min(held.length - 1, Math.floor(q * held.length))];
    return { count: this.count, p50: at(0.5), p95: at(0.95), p99: at(0.99) };
  }
}

const isRequested = () => {
  if (typeof window === "undefined") {
    return false;
  }
  return window.__NDRAW_PERF === true || new URLSearchParams(window.location.search).has("ndraw-perf");
};

class PerformanceManager {
  readonly active: boolean;
  private readonly metrics = new Map<string, Ring>();
  private readonly counters = new Map<string, number>();
  private readonly marks = new Map<string, number>();
  private observer?: PerformanceObserver;
  private lastFrame = 0;

  constructor(active: boolean) {
    this.active = active;
    if (!active) {
      return;
    }
    const onFrame = (time: number) => {
      if (this.lastFrame !== 0) {
        this.sample("fps", 1000 / (time - this.lastFrame));
      }
      this.lastFrame = time;
      requestAnimationFrame(onFrame);
    };
    requestAnimationFrame(onFrame);
    if (typeof PerformanceObserver !== "undefined" && PerformanceObserver.supportedEntryTypes?.includes("longtask")) {
      this.observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          this.sample("longTask", entry.duration);
        }
      });
      this.observer.observe({ type: "longtask" });
    }
  }

  mark(name: string) {
    if (this.active) {
      this.marks.set(name, performance.now());
    }
  }

  measureEnd(name: string, startMark: string) {
    if (!this.active) {
      return;
    }
    const startedAt = this.marks.get(startMark);
    if (startedAt !== undefined) {
      this.end(name, startedAt);
      this.marks.delete(startMark);
    }
  }

  /** start time for end(); 0 when inactive */
  start(): number {
    return this.active ? performance.now() : 0;
  }

  end(name: string, startedAt: number) {
    if (this.active) {
      this.sample(name, performance.now() - startedAt);
    }
  }

  sample(name: string, value: number) {
    if (!this.active) {
      return;
    }
    let ring = this.metrics.get(name);
    if (!ring) {
      ring = new Ring();
      this.metrics.set(name, ring);
    }
    ring.push(value);
  }

  count(name: string, n = 1) {
    if (this.active) {
      this.counters.set(name, (this.counters.get(name) ?? 0) + n);
    }
  }

  report(): PerfReport {
    const metrics: PerfReport = { longTask: { p50: 0, p95: 0, p99: 0, count: 0 } };
    for (const [name, ring] of this.metrics) {
      metrics[name] = ring.summary();
    }
    for (const [name, total] of this.counters) {
      metrics[name] = { p50: total, p95: total, p99: total, count: total };
    }
    return metrics;
  }

  reset() {
    if (!this.active) {
      return;
    }
    this.metrics.clear();
    this.counters.clear();
    this.marks.clear();
    this.observer?.takeRecords();
    this.lastFrame = 0;
  }
}

export const perf = new PerformanceManager(isRequested());
