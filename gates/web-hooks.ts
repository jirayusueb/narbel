import { defineGate, defineProofs, defineRules, mutate, proof } from "redproof";
import { command } from "redproof/command";

const rules = defineRules({
  reactuseHooks: {
    id: "web/reactuse-hooks",
    description:
      "React code uses @reactuses/core hooks instead of hand-written observers, EventSource and addEventListener.",
  },
});

const gate = defineGate({
  id: "web-hooks",
  rules,
  check: command({
    rule: rules.reactuseHooks,
    command: "bun",
    args: ["gate-checks/web-hooks.ts"],
    timeoutMs: 60_000,
  }),
});

export const proofs = defineProofs(gate, [
  proof.red(
    rules.reactuseHooks,
    "detects a hand-written listener in React code",
    mutate.createFile(
      "apps/web/src/shared/lib/use-probe.ts",
      'export const probe = () => document.addEventListener("keydown", () => {});\n'
    )
  ),
  proof.green("accepts the current tree"),
]);

export default gate;
