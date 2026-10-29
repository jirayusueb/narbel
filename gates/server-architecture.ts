import { dependencyCruiser } from "@redproof/dependency-cruiser";
import { defineGate, defineProofs, mutate, proof } from "redproof";

const F = "apps/server/src/features";

const adapter = dependencyCruiser({
  configFile: "gates/depcruise/server.cjs",
  files: ["apps/server/src"],
  rules: {
    sharedNoFeatures: "server-shared-no-features",
    domainPure: "server-domain-pure",
    applicationInward: "server-application-inward",
    presentationNoInfrastructure: "server-presentation-no-infrastructure",
    infrastructureNoPresentation: "server-infrastructure-no-presentation",
    featurePublicApi: "server-feature-public-api",
  },
});

const gate = defineGate({ id: "server-architecture", adapter });

export const proofs = defineProofs(gate, [
  proof.red(
    adapter.rules.sharedNoFeatures,
    "detects shared importing a feature",
    mutate.appendText(
      "apps/server/src/shared/kernel/errors/AppError.ts",
      '\nimport "../../../features/board/index";\n'
    )
  ),
  proof.red(
    adapter.rules.domainPure,
    "detects a framework import in the domain",
    mutate.appendText(
      `${F}/board/domain/values/BoardTitle.ts`,
      '\nimport "elysia";\n'
    )
  ),
  proof.red(
    adapter.rules.applicationInward,
    "detects a use case importing infrastructure",
    mutate.appendText(
      `${F}/board/application/usecases/CreateBoard.ts`,
      '\nimport "../../infrastructure/crdt/YjsBoardHub";\n'
    )
  ),
  proof.red(
    adapter.rules.presentationNoInfrastructure,
    "detects a controller importing infrastructure",
    mutate.appendText(
      `${F}/board/presentation/http/BoardController.ts`,
      '\nimport "../../infrastructure/crdt/YjsBoardHub";\n'
    )
  ),
  proof.red(
    adapter.rules.infrastructureNoPresentation,
    "detects infrastructure importing presentation",
    mutate.appendText(
      `${F}/board/infrastructure/crdt/YjsBoardHub.ts`,
      '\nimport "../../presentation/http/BoardController";\n'
    )
  ),
  proof.red(
    adapter.rules.featurePublicApi,
    "detects a feature reaching into another feature's internals",
    mutate.appendText(
      `${F}/auth/ioc.ts`,
      '\nimport "../board/domain/values/BoardTitle";\n'
    )
  ),
  proof.green("accepts the current server architecture"),
]);

export default gate;
