import { defineConfig } from "oxlint";
import core from "ultracite/oxlint/core";
import react from "ultracite/oxlint/react";
import tanstack from "ultracite/oxlint/tanstack";

export default defineConfig({
  extends: [core, react, tanstack],
  // shadcn components, agent skills and the fun-isometric sticker kit are vendored and updated from upstream
  ignorePatterns: [
    ...core.ignorePatterns,
    "packages/ui/src/components/**",
    "apps/web/src/shared/ui/stickers/**",
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
    {
      // test doubles and arrange helpers read better inline than hoisted
      files: [
        "apps/server/src/**/*.test.ts",
        "apps/server/src/**/fakes.ts",
        "apps/server/src/**/MemoryBus.ts",
      ],
      rules: {
        "unicorn/no-await-expression-member": "off",
        "unicorn/consistent-function-scoping": "off",
        "unicorn/no-array-sort": "off",
        "eslint/no-await-in-loop": "off",
        "promise/no-return-wrap": "off",
        "eslint/no-useless-return": "off",
      },
    },
    {
      // ops scripts drive remote APIs step by step; order and retries matter more than parallelism
      files: ["scripts/**"],
      rules: {
        "eslint/no-await-in-loop": "off",
        "unicorn/no-await-expression-member": "off",
      },
    },
  ],
});
