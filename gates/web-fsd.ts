import { dependencyCruiser } from "@redproof/dependency-cruiser";
import { defineGate, defineProofs, mutate, proof } from "redproof";

const W = "apps/web/src";

const adapter = dependencyCruiser({
  configFile: "gates/depcruise/web.cjs",
  files: ["apps/web/src"],
  rules: {
    layerOrder: "fsd-layer-order",
    noCrossSlice: "fsd-no-cross-slice",
    publicApi: "fsd-public-api",
    thinRoutes: "fsd-thin-routes",
  },
});

const gate = defineGate({ id: "web-fsd", adapter });

export const proofs = defineProofs(gate, [
  proof.red(
    adapter.rules.layerOrder,
    "detects shared importing an entity",
    mutate.appendText(
      `${W}/shared/lib/index.ts`,
      '\nimport "@/entities/board";\n'
    )
  ),
  proof.red(
    adapter.rules.noCrossSlice,
    "detects a feature importing a sibling feature",
    mutate.appendText(
      `${W}/features/create-board/ui/create-board-dialog.tsx`,
      '\nimport "@/features/rename-board";\n'
    )
  ),
  proof.red(
    adapter.rules.publicApi,
    "detects a deep import past a slice's index",
    mutate.appendText(
      `${W}/pages/board/ui/board-page.tsx`,
      '\nimport "@/widgets/board-canvas/ui/board-editor";\n'
    )
  ),
  proof.red(
    adapter.rules.thinRoutes,
    "detects a route importing below pages",
    mutate.appendText(`${W}/routes/index.tsx`, '\nimport "@/shared/ui";\n')
  ),
  proof.green("accepts the current FSD layering"),
]);

export default gate;
