import { defineGate, defineProofs, defineRules, mutate, proof } from "redproof";
import { command } from "redproof/command";

const rules = defineRules({
  maxLines: {
    id: "size/max-lines",
    description:
      "No non-test source file under apps/server/src or apps/web/src exceeds 750 lines.",
  },
});

const gate = defineGate({
  id: "file-size",
  rules,
  check: command({
    rule: rules.maxLines,
    command: "bun",
    args: ["gate-checks/file-size.ts"],
    timeoutMs: 60_000,
  }),
});

export const proofs = defineProofs(gate, [
  proof.red(
    rules.maxLines,
    "detects a file over the line ceiling",
    mutate.createFile(
      "apps/server/src/features/boards/Probe.ts",
      "\n".repeat(751)
    )
  ),
  proof.green("accepts the current tree"),
]);

export default gate;
