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
    schemaBoardsOwner: "server-schema-boards-owner",
    schemaDrawingOwner: "server-schema-drawing-owner",
    schemaSearchOwner: "server-schema-search-owner",
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
      '\nimport "../../../features/boards/index";\n'
    )
  ),
  proof.red(
    adapter.rules.domainPure,
    "detects a framework import in the domain",
    mutate.appendText(
      `${F}/boards/domain/values/BoardTitle.ts`,
      '\nimport "elysia";\n'
    )
  ),
  proof.red(
    adapter.rules.applicationInward,
    "detects a use case importing infrastructure",
    mutate.appendText(
      `${F}/boards/application/usecases/CreateBoard.ts`,
      '\nimport "../../infrastructure/repositories/DrizzleBoardRepository";\n'
    )
  ),
  proof.red(
    adapter.rules.presentationNoInfrastructure,
    "detects a controller importing infrastructure",
    mutate.appendText(
      `${F}/boards/presentation/http/BoardController.ts`,
      '\nimport "../../infrastructure/repositories/DrizzleBoardRepository";\n'
    )
  ),
  proof.red(
    adapter.rules.infrastructureNoPresentation,
    "detects infrastructure importing presentation",
    mutate.appendText(
      `${F}/drawing/infrastructure/crdt/YjsBoardHub.ts`,
      '\nimport "../../presentation/http/BoardFileController";\n'
    )
  ),
  proof.red(
    adapter.rules.featurePublicApi,
    "detects a feature reaching into another feature's internals",
    mutate.appendText(
      `${F}/auth/ioc.ts`,
      '\nimport "../drawing/domain/values/FileKey";\n'
    )
  ),
  proof.red(
    adapter.rules.featurePublicApi,
    "detects a context reaching into search's internals",
    mutate.appendText(
      `${F}/drawing/ioc.ts`,
      '\nimport "../search/infrastructure/repositories/DrizzleSearchMirrors";\n'
    )
  ),
  proof.red(
    adapter.rules.schemaBoardsOwner,
    "detects a boards schema import outside features/boards",
    mutate.appendText(
      `${F}/drawing/infrastructure/repositories/DrizzleBoardFileRepository.ts`,
      '\nimport { board } from "@narbel/db/schema/boards";\n'
    )
  ),
  proof.red(
    adapter.rules.schemaDrawingOwner,
    "detects a drawing schema import outside features/drawing",
    mutate.appendText(
      `${F}/boards/infrastructure/repositories/DrizzleBoardRepository.ts`,
      '\nimport { boardDocument } from "@narbel/db/schema/drawing";\n'
    )
  ),
  proof.red(
    adapter.rules.schemaSearchOwner,
    "detects a search schema import outside features/search, drawing's former write path included",
    mutate.appendText(
      `${F}/drawing/infrastructure/repositories/DrizzleBoardDocumentStore.ts`,
      '\nimport { boardText } from "@narbel/db/schema/search";\n'
    )
  ),
  proof.red(
    adapter.rules.schemaAuthOwner,
    "detects an auth schema import outside features/auth and features/profile",
    mutate.appendText(
      "apps/server/src/features/notification/ioc.ts",
      '\nimport { user } from "@narbel/db/schema/auth";\n'
    )
  ),
  proof.red(
    adapter.rules.schemaAccountOwner,
    "detects an account schema import outside shared and features/notification",
    mutate.appendText(
      "apps/server/src/features/boards/ioc.ts",
      '\nimport { outbox } from "@narbel/db/schema/account";\n'
    )
  ),
  proof.red(
    adapter.rules.schemaDiscussionOwner,
    "detects a discussion schema import outside features/discussion",
    mutate.appendText(
      "apps/server/src/features/boards/ioc.ts",
      '\nimport { comment } from "@narbel/db/schema/discussion";\n'
    )
  ),
  proof.green("accepts the current server architecture"),
]);

export default gate;
