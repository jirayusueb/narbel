// A redproof check: React code in apps/web/src reaches observers, event streams and listeners through
// @reactuses/core hooks, which own cleanup. oxlint has no no-restricted-syntax, so this scans.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT = "apps/web/src";
const BANNED = [
  ["new ResizeObserver", "useResizeObserver"],
  ["new IntersectionObserver", "useIntersectionObserver"],
  ["new EventSource", "useEventSource"],
  [".addEventListener(", "useEventListener"],
] as const;
// Paths are relative to ROOT; each one says why a hook cannot do the job there.
const ALLOWED: Record<string, string> = {
  "entities/drawing/model/board-cache.ts":
    "IndexedDB requests are not DOM events and run outside React",
  "shared/ui/stickers/fun.ts": "vendored sticker kit, updated from upstream",
  "widgets/board-canvas/model/use-comments-sheet.ts":
    "the panel mounts in the same commit that opens it, but useEventListener resolves its target during render (a null target means window)",
  "widgets/board-canvas/model/use-compact-chrome.ts":
    "one ResizeObserver over up to five elements feeds a single measure; useResizeObserver observes one target",
};

const offenders: string[] = [];
for (const entry of readdirSync(ROOT, { recursive: true, encoding: "utf-8" })) {
  if (
    !/\.tsx?$/u.test(entry) ||
    /\.test\.tsx?$/u.test(entry) ||
    entry in ALLOWED
  ) {
    continue;
  }
  const text = readFileSync(path.join(ROOT, entry), "utf-8");
  for (const [code, hook] of BANNED) {
    if (text.includes(code)) {
      offenders.push(
        `${ROOT}/${entry}: ${code} -> use ${hook} from @reactuses/core`
      );
    }
  }
}

for (const line of offenders) {
  console.error(line);
}
process.exit(offenders.length > 0 ? 1 : 0);
