import { defineGate, defineProofs, defineRules, mutate, proof } from "redproof";
import { command } from "redproof/command";

const rules = defineRules({
  lint: {
    id: "monorepo/lint",
    description: "Ultracite (oxlint + oxfmt) reports no problems.",
  },
});

const gate = defineGate({
  id: "lint",
  rules,
  check: command({
    rule: rules.lint,
    command: "bun",
    args: ["run", "check"],
    timeoutMs: 300_000,
  }),
});

export const proofs = defineProofs(gate, [
  proof.red(
    rules.lint,
    "detects a debugger statement",
    mutate.appendText(
      "apps/server/src/main.ts",
      "\nexport function redproofLint() {\n  debugger;\n}\n"
    )
  ),
  proof.green("accepts the current tree"),
]);

export default gate;
