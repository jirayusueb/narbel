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
      // ops and measurement scripts drive APIs step by step; order matters more than parallelism
      files: ["scripts/**", "apps/server/scripts/**"],
      rules: {
        "eslint/no-await-in-loop": "off",
        "unicorn/no-await-expression-member": "off",
      },
    },
    {
      // SERVER_URL is the internal API address during SSR; rendering it breaks hydration
      files: ["apps/web/src/**/ui/**", "apps/web/src/routes/**"],
      rules: {
        "eslint/no-restricted-imports": [
          "error",
          {
            paths: [
              {
                name: "@/shared/config",
                importNames: ["SERVER_URL"],
                message:
                  "Render PUBLIC_SERVER_URL; SERVER_URL is for requests only.",
              },
            ],
          },
        ],
      },
    },
  ],
});
