import { defineGate, defineProofs, defineRules, mutate, proof } from "redproof";
import { commands } from "redproof/command";

// tsrs only: the web package's check-types script also runs `vite build`, which rewrites
// routeTree.gen.ts and .output and breaks Redproof's workspace restore check.
const PROJECTS = [
  "apps/server",
  "apps/web",
  "packages/auth",
  "packages/db",
  "packages/ui",
];

const rules = defineRules({
  typecheck: {
    id: "monorepo/typecheck",
    description: "Every workspace package type-checks (tsrs --noEmit).",
  },
});

const gate = defineGate({
  id: "typecheck",
  rules,
  check: commands({
    mode: "parallel",
    entries: PROJECTS.map((project) => ({
      rule: rules.typecheck,
      label: project,
      command: "bun",
      args: ["x", "tsrs", "--noEmit", "-p", project],
      timeoutMs: 300_000,
    })),
  }),
});

export const proofs = defineProofs(gate, [
  proof.red(
    rules.typecheck,
    "detects a type error in the server",
    mutate.appendText(
      "apps/server/src/main.ts",
      '\nexport const redproofBroken: number = "not a number";\n'
    )
  ),
  proof.red(
    rules.typecheck,
    "detects a type error in the web app",
    mutate.appendText(
      "apps/web/src/router.tsx",
      '\nexport const redproofBroken: number = "not a number";\n'
    )
  ),
  proof.green("accepts the current tree"),
]);

export default gate;
