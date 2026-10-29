import { defineConfig } from "tsdown";

export default defineConfig({
  entry: { index: "./src/main.ts" },
  format: "esm",
  outDir: "./dist",
  clean: true,
  deps: {
    alwaysBundle: [/@narbel\/.*/u],
  },
});
