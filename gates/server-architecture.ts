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
    schemaBoardOwner: "server-schema-board-owner",
    schemaAuthOwner: "server-schema-auth-owner",
    schemaAccountOwner: "server-schema-account-owner",
    schemaDiscussionOwner: "server-schema-discussion-owner",
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
  proof.red(
    adapter.rules.schemaBoardOwner,
    "detects a board schema import outside features/board",
    mutate.appendText(
      "apps/server/src/shared/kernel/errors/AppError.ts",
      '\nimport { board } from "@narbel/db/schema/board";\n'
    )
  ),
  proof.red(
    adapter.rules.schemaAuthOwner,
    "detects an auth schema import outside features/auth and the one legacy reader",
    mutate.appendText(
      "apps/server/src/features/notification/ioc.ts",
      '\nimport { user } from "@narbel/db/schema/auth";\n'
    )
  ),
  proof.red(
    adapter.rules.schemaAccountOwner,
    "detects an account schema import outside shared and features/notification",
    mutate.appendText(
      "apps/server/src/features/board/ioc.ts",
      '\nimport { outbox } from "@narbel/db/schema/account";\n'
    )
  ),
  proof.red(
    adapter.rules.schemaDiscussionOwner,
    "detects a discussion schema import outside features/discussion",
    mutate.appendText(
      "apps/server/src/features/board/ioc.ts",
      '\nimport { comment } from "@narbel/db/schema/discussion";\n'
    )
  ),
  proof.green("accepts the current server architecture"),
]);

export default gate;
