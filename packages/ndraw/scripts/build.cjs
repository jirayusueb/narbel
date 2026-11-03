const path = require("node:path");
const { build } = require("esbuild");
const { sassPlugin } = require("esbuild-sass-plugin");

const root = path.resolve(__dirname, "..");
const src = path.join(root, "src");

// fonts still load from the upstream npm build on esm.sh, whose URL is built from these two values
// shortcut: fonts come from esm.sh's copy of upstream 0.18.1, self-host them via window.EXCALIDRAW_ASSET_PATH once ndraw changes fonts
const PKG = { PKG_NAME: "@excalidraw/excalidraw", PKG_VERSION: "0.18.1" };

// the upstream .env.development / .env.production values that the library reads
const LIBRARY = {
  VITE_APP_LIBRARY_URL: "https://libraries.excalidraw.com",
  VITE_APP_LIBRARY_BACKEND:
    "https://us-central1-excalidraw-room-persistence.cloudfunctions.net/libraries",
};

const ENV_VARS = {
  development: {
    ...LIBRARY,
    VITE_APP_ENABLE_TRACKING: "true",
    VITE_APP_DEBUG_ENABLE_TEXT_CONTAINER_BOUNDING_BOX: "",
    ...PKG,
    DEV: true,
  },
  production: {
    ...LIBRARY,
    VITE_APP_ENABLE_TRACKING: "false",
    VITE_APP_DEBUG_ENABLE_TEXT_CONTAINER_BOUNDING_BOX: "false",
    ...PKG,
    PROD: true,
  },
};

const config = (outdir) => ({
  absWorkingDir: path.join(src, "excalidraw"),
  entryPoints: ["index.tsx", "**/*.chunk.ts"],
  entryNames: "[name]",
  outdir: path.join(root, outdir),
  bundle: true,
  splitting: true,
  format: "esm",
  packages: "external",
  // quietDeps mutes open-color, which still uses global built-ins; our own sources must stay warning-free
  plugins: [
    sassPlugin({
      loadPaths: [path.join(root, "node_modules")],
      quietDeps: true,
    }),
  ],
  target: "es2020",
  assetNames: "[dir]/[name]",
  chunkNames: "[dir]/[name]-[hash]",
  alias: {
    "@excalidraw/excalidraw": path.join(src, "excalidraw"),
    "@excalidraw/utils": path.join(src, "utils"),
    "@excalidraw/math": path.join(src, "math"),
  },
  loader: { ".woff2": "file" },
});

const main = async () => {
  await build({
    ...config("dist/dev"),
    sourcemap: true,
    define: { "import.meta.env": JSON.stringify(ENV_VARS.development) },
  });
  await build({
    ...config("dist/prod"),
    minify: true,
    define: { "import.meta.env": JSON.stringify(ENV_VARS.production) },
  });
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
