import { defineConfig } from "oxfmt";
import ultracite from "ultracite/oxfmt";

export default defineConfig({
  ...ultracite,
  // agent skills are vendored and updated from upstream, as in oxlint.config.ts
  ignorePatterns: [...ultracite.ignorePatterns, ".agents/**", ".claude/**"],
});
