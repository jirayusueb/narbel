import { defineConfig } from "tsdown";

export default defineConfig({
  entry: { index: "./src/main.ts" },
  format: "esm",
  outDir: "./dist",
  clean: true,
  // Runtime bundle only; web gets server types from package.json "types" (src). dts would need the typescript package.
  dts: false,
  deps: {
    alwaysBundle: [/@narbel\/.*/u],
  },
});
