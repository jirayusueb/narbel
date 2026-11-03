import { defineConfig } from "oxfmt";
import ultracite from "ultracite/oxfmt";

export default defineConfig({
  ...ultracite,
  // agent skills and the Excalidraw fork are vendored and updated from upstream, as in oxlint.config.ts
  ignorePatterns: [
    ...ultracite.ignorePatterns,
    ".agents/**",
    ".claude/**",
    "packages/ndraw/**",
  ],
});
