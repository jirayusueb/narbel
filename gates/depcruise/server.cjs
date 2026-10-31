const S = "^apps/server/src";
const FEATURE_INTERNAL = `${S}/features/[^/]+/(domain|application|infrastructure|presentation)/`;

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "server-shared-no-features",
      comment:
        "shared kernel and cross-cutting code must not depend on any feature",
      severity: "error",
      from: { path: `${S}/shared/` },
      to: { path: `${S}/features/` },
    },
    {
      name: "server-domain-pure",
      comment:
        "domain imports only its own domain and the shared kernel (no frameworks, no npm)",
      severity: "error",
      from: { path: `${S}/features/([^/]+)/domain/` },
      to: { pathNot: [`${S}/features/$1/domain/`, `${S}/shared/kernel/`] },
    },
    {
      name: "server-application-inward",
      comment:
        "application imports only its own domain/application and shared kernel/application",
      severity: "error",
      from: { path: `${S}/features/([^/]+)/application/` },
      to: {
        pathNot: [
          `${S}/features/$1/(domain|application)/`,
          `${S}/shared/(kernel|application)/`,
        ],
      },
    },
    {
      name: "server-presentation-no-infrastructure",
      comment: "presentation reaches infrastructure only through ioc.ts",
      severity: "error",
      from: { path: `${S}/(features/[^/]+|shared)/presentation/` },
      to: { path: `${S}/(features/[^/]+|shared)/infrastructure/` },
    },
    {
      name: "server-infrastructure-no-presentation",
      severity: "error",
      from: { path: `${S}/(features/[^/]+|shared)/infrastructure/` },
      to: { path: `${S}/(features/[^/]+|shared)/presentation/` },
    },
    {
      name: "server-feature-public-api",
      comment:
        "a feature reaches another feature only through features/<other>/index.ts",
      severity: "error",
      from: { path: `${S}/features/([^/]+)/` },
      to: { path: FEATURE_INTERNAL, pathNot: `${S}/features/$1/` },
    },
    {
      // step 3 of docs/architecture/contexts.md: only the owning context imports a schema file
      name: "server-schema-boards-owner",
      comment:
        "schema/boards.ts (board, board_access, board_share) belongs to features/boards",
      severity: "error",
      from: { path: `${S}/`, pathNot: `${S}/features/boards/` },
      to: { path: "packages/db/src/schema/boards\\.ts$" },
    },
    {
      name: "server-schema-drawing-owner",
      comment:
        "schema/drawing.ts (board_document, board_version, board_file, user_library) belongs to features/drawing",
      severity: "error",
      from: { path: `${S}/`, pathNot: `${S}/features/drawing/` },
      to: { path: "packages/db/src/schema/drawing\\.ts$" },
    },
    {
      name: "server-schema-search-owner",
      comment:
        "schema/search.ts (board_text, board_text_version, search_comment) belongs to features/search; drawing and discussion only publish events",
      severity: "error",
      from: { path: `${S}/`, pathNot: `${S}/features/search/` },
      to: { path: "packages/db/src/schema/search\\.ts$" },
    },
    {
      name: "server-schema-auth-owner",
      comment:
        "schema/auth.ts belongs to features/auth and features/profile (identity's profile module); everyone else asks identity through IProfileReader",
      severity: "error",
      from: {
        path: `${S}/`,
        pathNot: [`${S}/features/auth/`, `${S}/features/profile/`],
      },
      to: { path: "packages/db/src/schema/auth\\.ts$" },
    },
    {
      name: "server-schema-account-owner",
      comment:
        "schema/account.ts (notification, outbox, profile tables) stays with shared, features/notification and features/profile until the contexts own their tables",
      severity: "error",
      from: {
        path: `${S}/`,
        pathNot: [
          `${S}/shared/`,
          `${S}/features/notification/`,
          `${S}/features/profile/`,
        ],
      },
      to: { path: "packages/db/src/schema/account\\.ts$" },
    },
    {
      name: "server-schema-discussion-owner",
      comment:
        "schema/discussion.ts (comment, comment_reaction) belongs to features/discussion",
      severity: "error",
      from: { path: `${S}/`, pathNot: `${S}/features/discussion/` },
      to: { path: "packages/db/src/schema/discussion\\.ts$" },
    },
  ],
  options: {
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "gates/depcruise/tsconfig.server.json" },
    doNotFollow: { path: "node_modules" },
    exclude: { path: "\\.test\\.ts$" },
  },
};
