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
  ],
  options: {
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "gates/depcruise/tsconfig.server.json" },
    doNotFollow: { path: "node_modules" },
    exclude: { path: "\\.test\\.ts$" },
  },
};
