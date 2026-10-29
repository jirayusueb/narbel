import { defineConfig } from "oxlint";
import core from "ultracite/oxlint/core";
import react from "ultracite/oxlint/react";
import tanstack from "ultracite/oxlint/tanstack";

export default defineConfig({
  extends: [core, react, tanstack],
  // shadcn components and agent skills are vendored and updated by their own CLIs
  ignorePatterns: [
    ...core.ignorePatterns,
    "packages/ui/src/components/**",
    ".agents/**",
    ".claude/**",
  ],
  overrides: [
    {
      // the server follows the clean-architecture gist: PascalCase class files,
      // constructor injection via parameter properties, method-style port signatures
      files: ["apps/server/src/**"],
      rules: {
        "unicorn/filename-case": "off",
        "typescript/parameter-properties": "off",
        "typescript/method-signature-style": "off",
        "eslint/class-methods-use-this": "off",
        "eslint/max-classes-per-file": "off",
      },
    },
  ],
});
