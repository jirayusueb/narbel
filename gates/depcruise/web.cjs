const W = "^apps/web/src";
const SLICED = "(entities|features|widgets|pages)";

const above = {
  shared: "(entities|features|widgets|pages|app|routes)",
  entities: "(features|widgets|pages|app|routes)",
  features: "(widgets|pages|app|routes)",
  widgets: "(pages|app|routes)",
  pages: "(app|routes)",
};

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    ...Object.entries(above).map(([layer, higher]) => ({
      name: "fsd-layer-order",
      comment: `${layer} must not import from layers above it`,
      severity: "error",
      from: { path: `${W}/${layer}/` },
      to: { path: `${W}/${higher}/` },
    })),
    {
      name: "fsd-no-cross-slice",
      comment: "slices of the same layer must not import each other",
      severity: "error",
      from: { path: `${W}/${SLICED}/([^/]+)/` },
      to: { path: `${W}/$1/`, pathNot: `${W}/$1/$2/` },
    },
    {
      name: "fsd-public-api",
      comment: "other slices import a slice only through its index",
      severity: "error",
      from: { path: `${W}/${SLICED}/([^/]+)/` },
      to: {
        path: `${W}/${SLICED}/[^/]+/.+`,
        pathNot: [`${W}/$1/$2/`, `${W}/${SLICED}/[^/]+/index\\.tsx?$`],
      },
    },
    {
      name: "fsd-public-api",
      comment: "app, routes and router import slices only through their index",
      severity: "error",
      from: { path: `${W}/(app/|routes/|router\\.tsx)` },
      to: {
        path: `${W}/${SLICED}/[^/]+/.+`,
        pathNot: `${W}/${SLICED}/[^/]+/index\\.tsx?$`,
      },
    },
    {
      name: "fsd-thin-routes",
      comment: "route files only compose pages and app",
      severity: "error",
      from: { path: `${W}/routes/` },
      to: { path: `${W}/(shared|entities|features|widgets)/` },
    },
  ],
  options: {
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "gates/depcruise/tsconfig.web.json" },
    doNotFollow: { path: "node_modules" },
    exclude: { path: "(routeTree\\.gen\\.ts|\\.test\\.tsx?)$" },
  },
};
