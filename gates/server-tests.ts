import { defineGate, defineProofs, defineRules, mutate, proof } from "redproof";
import { command } from "redproof/command";

const rules = defineRules({
  tests: {
    id: "server/unit-tests",
    description: "Server unit tests (bun test) pass.",
  },
});

const gate = defineGate({
  id: "server-tests",
  rules,
  check: command({
    rule: rules.tests,
    command: "bun",
    args: ["test"],
    cwd: "apps/server",
    timeoutMs: 300_000,
  }),
});

export const proofs = defineProofs(gate, [
  proof.red(
    rules.tests,
    "detects a failing test",
    mutate.createFile(
      "apps/server/src/redproof-canary.test.ts",
      'import { expect, test } from "bun:test";\ntest("canary", () => expect(1).toBe(2));\n'
    )
  ),
  proof.green("accepts the current suite"),
]);

export default gate;
