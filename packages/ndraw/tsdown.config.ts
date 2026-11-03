import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Plugin } from "rolldown";
import { viteDynamicImportVarsPlugin, viteImportGlobPlugin } from "rolldown/experimental";
import { defineConfig, type UserConfig } from "tsdown";

const root = import.meta.dirname;
const src = path.join(root, "src");
const app = path.join(src, "excalidraw");

// fonts still load from the upstream npm build on esm.sh, whose URL is built from these two values
// shortcut: fonts come from esm.sh's copy of upstream 0.18.1, self-host them via window.EXCALIDRAW_ASSET_PATH once ndraw changes fonts
const PKG = { PKG_NAME: "@excalidraw/excalidraw", PKG_VERSION: "0.18.1" };

// the upstream .env.development / .env.production values that the library reads
const LIBRARY = {
  VITE_APP_LIBRARY_URL: "https://libraries.excalidraw.com",
  VITE_APP_LIBRARY_BACKEND:
    "https://us-central1-excalidraw-room-persistence.cloudfunctions.net/libraries",
};

const DEVELOPMENT_ENV = {
  ...LIBRARY,
  VITE_APP_ENABLE_TRACKING: "true",
  VITE_APP_DEBUG_ENABLE_TEXT_CONTAINER_BOUNDING_BOX: "",
  ...PKG,
  DEV: true,
};

const PRODUCTION_ENV = {
  ...LIBRARY,
  VITE_APP_ENABLE_TRACKING: "false",
  VITE_APP_DEBUG_ENABLE_TEXT_CONTAINER_BOUNDING_BOX: "false",
  ...PKG,
  PROD: true,
};

// fonts resolve against the esm.sh base URL, so a .woff2 import must stay the string "./fonts/<family>/<file>.woff2"
const woff2Assets: Plugin = {
  name: "ndraw:woff2",
  async load(id) {
    if (!id.endsWith(".woff2")) {
      return null;
    }
    const fileName = path.relative(app, id);
    this.emitFile({ type: "asset", fileName, source: await readFile(id) });
    return { code: `export default ${JSON.stringify(`./${fileName}`)};`, moduleType: "js" };
  },
};

const shared = {
  entry: {
    index: path.join(app, "index.tsx"),
    "subset-shared.chunk": path.join(app, "subset/subset-shared.chunk.ts"),
    "subset-worker.chunk": path.join(app, "subset/subset-worker.chunk.ts"),
  },
  format: "esm",
  platform: "browser",
  target: "es2020",
  tsconfig: path.join(root, "tsconfig.json"),
  // the three upstream packages are aliased to src and must be bundled, everything else in node_modules stays external
  deps: { neverBundle: true, alwaysBundle: [/^@excalidraw\/(excalidraw|math|utils)(\/|$)/] },
  alias: {
    "@excalidraw/excalidraw": app,
    "@excalidraw/utils": path.join(src, "utils"),
    "@excalidraw/math": path.join(src, "math"),
  },
  // i18n.ts loads `./locales/${code}.json`: the first plugin turns it into import.meta.glob, the second splits that into chunks
  plugins: [woff2Assets, viteDynamicImportVarsPlugin(), viteImportGlobPlugin()],
  // en.json and percentages.json are imported statically too, so they stay in the main chunk on purpose
  checks: { ineffectiveDynamicImport: false },
  outputOptions: {
    chunkFileNames: (chunk) =>
      chunk.facadeModuleId?.includes("/locales/") ? "locales/[name]-[hash].js" : "[name]-[hash].js",
  },
  dts: false,
  clean: false,
  report: false,
} satisfies UserConfig;

const css = {
  fileName: "index.css",
  preprocessorOptions: {
    // quietDeps mutes open-color, which still uses global built-ins; our own sources must stay warning-free
    scss: { loadPaths: [path.join(root, "node_modules")], quietDeps: true },
  },
  lightningcss: {
    visitor: {
      Url: (url: { url: string }) =>
        url.url.startsWith("../fonts/") ? { ...url, url: url.url.slice(1) } : url,
    },
  },
} satisfies UserConfig["css"];

// fonts/fonts.css is the only stylesheet with file urls; its Assistant fonts sit next to it in src and under ./fonts in dist
const assistantFonts = path.join(app, "fonts/Assistant");
const devOut = path.join(root, "dist/dev");
const prodOut = path.join(root, "dist/prod");

export default defineConfig([
  {
    ...shared,
    outDir: devOut,
    copy: [{ from: assistantFonts, to: path.join(devOut, "fonts") }],
    define: { "import.meta.env": JSON.stringify(DEVELOPMENT_ENV) },
    css,
    sourcemap: true,
  },
  {
    ...shared,
    outDir: prodOut,
    copy: [{ from: assistantFonts, to: path.join(prodOut, "fonts") }],
    define: { "import.meta.env": JSON.stringify(PRODUCTION_ENV) },
    css: { ...css, minify: true },
    minify: true,
  },
]);
