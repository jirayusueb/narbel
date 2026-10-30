// A redproof check: ports (I-prefixed interfaces) are declared in application/ports or
// shared/application/interfaces; infrastructure only implements them. depcruise matches
// dependencies, not declarations, and oxlint has no no-restricted-syntax, so this scans.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = "apps/server/src";
const PORT = /^export interface I[A-Z]/mu;

const offenders: string[] = [];
const walk = (dir: string) => {
  for (const entry of readdirSync(dir)) {
    const file = path.join(dir, entry);
    if (statSync(file).isDirectory()) {
      walk(file);
    } else if (
      file.includes("/infrastructure/") &&
      file.endsWith(".ts") &&
      !file.endsWith(".test.ts") &&
      PORT.test(readFileSync(file, "utf-8"))
    ) {
      offenders.push(file);
    }
  }
};
walk(ROOT);

for (const file of offenders) {
  console.error(
    `${file}: declare the port in application/ports, not infrastructure`
  );
}
process.exit(offenders.length > 0 ? 1 : 0);
