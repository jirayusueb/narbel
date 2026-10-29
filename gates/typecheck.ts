import { defineGate, defineProofs, defineRules, mutate, proof } from "redproof";
import { command } from "redproof/command";

const rules = defineRules({
  typecheck: {
    id: "monorepo/typecheck",
    description: "Every workspace package type-checks (turbo check-types).",
  },
});

const gate = defineGate({
  id: "typecheck",
  rules,
  check: command({
    rule: rules.typecheck,
    command: "bun",
    args: ["run", "check-types", "--force"],
    timeoutMs: 600_000,
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
