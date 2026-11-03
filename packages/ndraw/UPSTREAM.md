# Upstream

`@narbel/ndraw` is a fork of [Excalidraw](https://github.com/excalidraw/excalidraw) at tag `v0.18.1`, commit `a2ec2889babf7d2295469c6d90ebe77fae57df84`. Excalidraw is MIT licensed; see `LICENSE`.

At that tag the npm package `@excalidraw/excalidraw` bundles three upstream folders. They map to this package as follows:

| Upstream               | Here              |
| ---------------------- | ----------------- |
| `packages/excalidraw/` | `src/excalidraw/` |
| `packages/math/`       | `src/math/`       |
| `packages/utils/`      | `src/utils/`      |

## Left out

- The tests: every `tests/` and `__snapshots__/` folder and every `*.test.*` file.
- Each package's root `package.json`, `README.md`, `CHANGELOG.md`, `tsconfig.json`, `.size-limit.json`, `.gitignore` and `env.cjs`. Nested files such as `src/excalidraw/locales/README.md` stay.

## Narbel-owned files

- `package.json` is derived from upstream `packages/excalidraw/package.json`. `exports`, `types`, `main` and `module` are verbatim, and `dependencies` are the upstream pins minus `sass` and `cross-env`, each moved to the newest release within its major: `@excalidraw/laser-pointer` `1.3.2`, `@excalidraw/random-username` `1.2.0`, `@radix-ui/react-popover` `1.3.1`, `@radix-ui/react-tabs` `1.2.1`, `perfect-freehand` `1.2.3` and `roughjs` `4.6.6`. `0.x` packages and packages whose newest release is a new major keep the upstream pin. `open-color` stays because the JS still imports it. The build tools sit in `devDependencies`. They follow upstream, with the same-major policy for the `@types/*` pins, with a few exceptions:
  - There is no Sass. The styles are plain CSS with native nesting (see below).
  - The build tools are `tsdown` `0.23.4` with `@tsdown/css` `0.23.4`, which bring Rolldown and Lightning CSS, instead of upstream's esbuild `0.19.10` with `esbuild-sass-plugin` `2.16.0`. `rolldown` `1.2.15` and `lightningcss` `1.33.0`, the versions tsdown uses, are direct devDependencies for `rolldown/experimental` plugins and `Features.Nesting`. All four are 0.x or experimental, so they are pinned exactly and move together.
  - `csstype` lets `src/excalidraw/css.d.ts` augment the same `csstype` that `@types/react` uses.
  - `@types/node` (`22.13.10` in upstream `yarn.lock`, now the newest 22.x) is there because upstream got it from the repo root.
  - `@types/react` and `@types/react-dom` follow `apps/web`, so there is a single React type identity.
  - `typescript` is `5.9.3`, the version upstream master moved to in `d080833f4`. TypeScript 7 is not used because it removed `moduleResolution: "node"`, and `"bundler"` breaks `browser-fs-access`'s untyped `exports` and the `.d.ts` emit of `editor-jotai.ts`.
  - `vite`, `vite-plugin-pwa` and `vite-plugin-svgr` are left out. Upstream only needed them for `/// <reference types>` lines; `src/excalidraw/vite-env.d.ts` now declares what the library reads.
- `tsconfig.json` is upstream `packages/excalidraw/tsconfig.json`, re-rooted at `src/`, so the types land in `dist/types/{excalidraw,math,utils}` as in npm. `typeRoots` keeps the repo root's `@types/bun` out of the build.
- `tsdown.config.ts` replaces upstream `scripts/buildPackage.js` and `env.cjs`. It writes ESM to `dist/dev` (sourcemaps) and `dist/prod` (minified JS and CSS). The differences:
  - `import.meta.env` is reduced to the keys the library reads.
  - `PKG_NAME` and `PKG_VERSION` are pinned to `@excalidraw/excalidraw` and `0.18.1`. Fonts load from `https://esm.sh/${PKG_NAME}@${PKG_VERSION}/dist/prod/`, so that URL stays the one in use today.
  - Lightning CSS lowers native nesting (`include: Features.Nesting`), so `dist/*/index.css` stays flat as the npm build was.
  - A small plugin turns each `.woff2` import into the string `./fonts/<family>/<file>.woff2` and emits the file at that path, as esbuild's `file` loader did. `fonts/fonts.css`'s `url(../fonts/Assistant/…)` is rewritten to `./fonts/Assistant/…` and those four files are copied, because Lightning CSS keeps urls as written.
  - `i18n.ts`'s ``import(`./locales/${code}.json`)`` is split into `locales/*` chunks by Rolldown's dynamic-import-vars and import-glob plugins. esbuild did this by itself.
  - Every package in `node_modules` stays external, as with esbuild's `packages: "external"`. `@excalidraw/{excalidraw,math,utils}` are aliased to `src` and forced into the bundle.
  - Against the esbuild build, `index.css` has the same rules up to Lightning CSS normalisation: two adjacent `Modal__content` rules merged, `.7rem 50%` written `.7rem`, and `padding: 0` moved within `.dropdown-select` but still before `padding-inline`. The bare imports in the JS are identical; only chunk names and splitting differ.

The built `.d.ts` files match npm except for three things. The first is React type spellings from the newer `@types/react`. The second is 23 inline imports that tsc synthesizes: npm emits `import("@excalidraw/math")`, which never resolved for consumers, and the fork emits a relative `import("../../math")` into its own `dist/types/math`. The third is how TypeScript 5.9 prints inferred types.

## Files changed under src/ versus upstream

- `src/excalidraw/data/encode.ts`, `data/encryption.ts`, `global.d.ts`, `hooks/useOutsideClick.ts`, `subset/harfbuzz/harfbuzz-loader.ts`, `subset/woff2/woff2-loader.ts`: upstream `d080833f4`, `Uint8Array<ArrayBuffer>` annotations for TypeScript 5.9.
- `src/excalidraw/components/Actions.tsx`: dropped `appState.activeTool.type !== "image"`, which `hasStrokeColor` already excludes and TypeScript 5.5+ flags as TS2367.
- `src/excalidraw/vite-env.d.ts`: removed the vite `/// <reference types>` lines, typed `DEV`/`PROD` as `boolean` (`tsdown.config.ts` defines them as `true`), declared `*.woff2` modules.
- `src/excalidraw/react-app-env.d.ts`: deleted; it only referenced `react-scripts` types.
- `src/math/global.d.ts`, `src/utils/global.d.ts`: removed the `vite/client` reference.
- Every `.scss` file under `src/excalidraw/` (69 files) is replaced by plain CSS. `css/variables.module.scss` held only mixins and is gone; the other 68 are now `.css` files at the same path, and every `import "….scss"` in the `.ts`/`.tsx` files (75 imports) points to the `.css` file. `global.d.ts` declares `*.css` instead of `*.scss`. The conversion:
  - Native CSS nesting replaces Sass nesting. `&__x`/`&--x`/`&-x` suffixes are written as full class names, and `:root[dir=…] &`, `.excalidraw--mobile#{&}` (`isMobile`) and other `@at-root` forms as explicit top-level selectors, because native nesting would wrap the parent in `:is()`.
  - Mixins are pasted in, `$oc-*` and local variables are written as literal values, and `color.adjust` results as `rgba()`.
  - Declarations come before nested rules, and parent blocks are split wherever Sass emitted a rule in between, so rule order is unchanged.
  - Earlier steps, now folded in: the `@import` → `@use` migration, 22 hoisted mixed declarations, and `UserList`'s `.UserList__more`, whose own declarations come in a later `.UserList__more` rule so they still override the avatar styles (upstream `b9a255407`'s `& {}` fix).
  - Upstream fixes to a `.scss` file have to be ported by hand into the matching `.css` file.
  - Check used: each file's Sass 1.85.1 output equals its Lightning CSS bundle with nesting lowered, token for token. After the switch, `dist/prod/index.css` is byte-identical to the last Sass build.

## Policy

Take upstream fixes by cherry-picking single commits, never by merging upstream.

## Import and diff commands

```sh
TMP=$(mktemp -d)
curl -fsSL https://codeload.github.com/excalidraw/excalidraw/tar.gz/a2ec2889babf7d2295469c6d90ebe77fae57df84 | tar -xz -C "$TMP" --strip-components=1
mkdir -p packages/ndraw/src
for p in excalidraw math utils; do
  cp -R "$TMP/packages/$p" "packages/ndraw/src/$p"
  rm -rf "packages/ndraw/src/$p/tests" "packages/ndraw/src/$p"/{package.json,README.md,CHANGELOG.md,.size-limit.json,.gitignore,env.cjs,tsconfig.json}
done
find packages/ndraw/src -type d -name __snapshots__ -prune -exec rm -rf {} +
find packages/ndraw/src -type f -name '*.test.*' -delete
cp "$TMP/LICENSE" packages/ndraw/LICENSE
```

To list what differs from upstream (the output should match the section above):

```sh
for p in excalidraw math utils; do diff -r -x tests -x __snapshots__ -x '*.test.*' "$TMP/packages/$p" "packages/ndraw/src/$p" | grep -vE "^Only in $TMP/packages/$p: (package.json|README.md|CHANGELOG.md|.size-limit.json|.gitignore|env.cjs|tsconfig.json)$"; done
```

## Build

Run `bun run build` in `packages/ndraw`. It writes `dist/{dev,prod,types}`. `dist/` is gitignored, and turbo builds it before `web`.
