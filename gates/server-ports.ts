import { defineGate, defineProofs, defineRules, mutate, proof } from "redproof";
import { command } from "redproof/command";

const rules = defineRules({
  portsLocation: {
    id: "server/ports-location",
    description:
      "No I-prefixed interface is declared under an infrastructure folder.",
  },
});

const gate = defineGate({
  id: "server-ports",
  rules,
  check: command({
    rule: rules.portsLocation,
    command: "bun",
    args: ["gate-checks/no-infra-ports.ts"],
    timeoutMs: 60_000,
  }),
});

export const proofs = defineProofs(gate, [
  proof.red(
    rules.portsLocation,
    "detects a port interface declared in infrastructure",
    mutate.appendText(
      "apps/server/src/features/board/infrastructure/repositories/CachedBoardDocumentStore.ts",
      "\nexport interface IProbe {}\n"
    )
  ),
  proof.green("accepts the current tree"),
]);

export default gate;
