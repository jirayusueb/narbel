// A redproof check: no source file grows past MAX_LINES. The ceiling only stops growth.
// Vendored paths match the ones oxlint ignores.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOTS = ["apps/server/src", "apps/web/src"];
const VENDORED = new Set(["apps/web/src/shared/ui/stickers"]);
const MAX_LINES = 750;
const TEST_FILE = /\.(?:test|spec)\.tsx?$/u;
const SOURCE_FILE = /\.tsx?$/u;

const offenders: string[] = [];
const walk = (dir: string) => {
  if (VENDORED.has(dir)) {
    return;
  }
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(file);
    } else if (SOURCE_FILE.test(file) && !TEST_FILE.test(file)) {
      const lines = readFileSync(file, "utf-8").split("\n").length - 1;
      if (lines > MAX_LINES) {
        offenders.push(`${file}: ${lines} lines`);
      }
    }
  }
};
for (const root of ROOTS) {
  walk(root);
}

for (const offender of offenders) {
  console.error(`${offender}, over ${MAX_LINES}: split the file`);
}
process.exit(offenders.length > 0 ? 1 : 0);
