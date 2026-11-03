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

- `package.json` is derived from upstream `packages/excalidraw/package.json`. `exports`, `types`, `main` and `module` are verbatim, and `dependencies` are the upstream pins minus `sass` and `cross-env`. The build tools sit in `devDependencies`. They follow upstream with a few exceptions:
  - `sass` is `1.85.1`. That is the version upstream's `esbuild-sass-plugin` resolved `sass@^1.7.3` to in `yarn.lock`, and the one that actually compiled the npm build. The `1.51.0` pin was only used by the upstream app.
  - `csstype` lets `src/excalidraw/css.d.ts` augment the same `csstype` that `@types/react` uses.
  - `@types/node` (`22.13.10` in upstream `yarn.lock`) is there because upstream got it from the repo root.
  - `@types/react` and `@types/react-dom` follow `apps/web`, so there is a single React type identity.
  - `typescript` is `5.9.3`, the version upstream master moved to in `d080833f4`. TypeScript 7 is not used because it removed `moduleResolution: "node"`, and `"bundler"` breaks `browser-fs-access`'s untyped `exports` and the `.d.ts` emit of `editor-jotai.ts`.
  - `vite`, `vite-plugin-pwa` and `vite-plugin-svgr` are left out. Upstream only needed them for `/// <reference types>` lines; `src/excalidraw/vite-env.d.ts` now declares what the library reads.
- `tsconfig.json` is upstream `packages/excalidraw/tsconfig.json`, re-rooted at `src/`, so the types land in `dist/types/{excalidraw,math,utils}` as in npm. `typeRoots` keeps the repo root's `@types/bun` out of the build.
- `scripts/build.cjs` comes from upstream `scripts/buildPackage.js` and `env.cjs`. The differences:
  - `import.meta.env` is reduced to the keys the library reads.
  - `PKG_NAME` and `PKG_VERSION` are pinned to `@excalidraw/excalidraw` and `0.18.1`. Fonts load from `https://esm.sh/${PKG_NAME}@${PKG_VERSION}/dist/prod/`, so that URL stays the one in use today.
  - Sass runs with `quietDeps`, which mutes the global built-in warnings from `open-color` in `node_modules`. The fork's own Sass must build with no warnings.

The built `.d.ts` files match npm except for three things. The first is React type spellings from the newer `@types/react`. The second is 23 inline imports that tsc synthesizes: npm emits `import("@excalidraw/math")`, which never resolved for consumers, and the fork emits a relative `import("../../math")` into its own `dist/types/math`. The third is how TypeScript 5.9 prints inferred types.

## Files changed under src/ versus upstream

- `src/excalidraw/data/encode.ts`, `data/encryption.ts`, `global.d.ts`, `hooks/useOutsideClick.ts`, `subset/harfbuzz/harfbuzz-loader.ts`, `subset/woff2/woff2-loader.ts`: upstream `d080833f4`, `Uint8Array<ArrayBuffer>` annotations for TypeScript 5.9.
- `src/excalidraw/components/Actions.tsx`: dropped `appState.activeTool.type !== "image"`, which `hasStrokeColor` already excludes and TypeScript 5.5+ flags as TS2367.
- `src/excalidraw/vite-env.d.ts`: removed the vite `/// <reference types>` lines, typed `DEV`/`PROD` as `boolean` (`scripts/build.cjs` defines them as `true`), declared `*.woff2` modules.
- `src/excalidraw/react-app-env.d.ts`: deleted; it only referenced `react-scripts` types.
- `src/math/global.d.ts`, `src/utils/global.d.ts`: removed the `vite/client` reference.
- These `.scss` files under `src/excalidraw/`: Sass module system, no deprecation warnings. `sass-migrator module` turned `@import` into `@use` and `transparentize`/`fade-out` into `color.adjust`; every `variables.module` path ends in `.scss` because esbuild-sass-plugin reads `.module` as an extension; declarations written after nested rules moved above them (same CSS), except `UserList.scss`'s `.UserList__more`, whose declarations are wrapped in `& {}` as upstream `b9a255407` does, so they still override `avatarStyles`.
  - `components/Avatar.scss`
  - `components/Button.scss`
  - `components/ButtonIcon.scss`
  - `components/Card.scss`
  - `components/CheckboxItem.scss`
  - `components/ColorPicker/ColorPicker.scss`
  - `components/CommandPalette/CommandPalette.scss`
  - `components/ConfirmDialog.scss`
  - `components/ContextMenu.scss`
  - `components/Dialog.scss`
  - `components/ElementLinkDialog.scss`
  - `components/ExportDialog.scss`
  - `components/FilledButton.scss`
  - `components/FixedSideContainer.scss`
  - `components/FontPicker/FontPicker.scss`
  - `components/HelpDialog.scss`
  - `components/HintViewer.scss`
  - `components/IconPicker.scss`
  - `components/ImageExportDialog.scss`
  - `components/LayerUI.scss`
  - `components/LibraryMenu.scss`
  - `components/LibraryMenuItems.scss`
  - `components/LibraryUnit.scss`
  - `components/Modal.scss`
  - `components/OverwriteConfirm/OverwriteConfirm.scss`
  - `components/PasteChartDialog.scss`
  - `components/PublishLibrary.scss`
  - `components/RadioGroup.scss`
  - `components/Range.scss`
  - `components/SVGLayer.scss`
  - `components/SearchMenu.scss`
  - `components/ShareableLinkDialog.scss`
  - `components/Sidebar/Sidebar.scss`
  - `components/Sidebar/SidebarTrigger.scss`
  - `components/Spinner.scss`
  - `components/Switch.scss`
  - `components/TTDDialog/TTDDialog.scss`
  - `components/TextField.scss`
  - `components/TextInput.scss`
  - `components/Toast.scss`
  - `components/ToolIcon.scss`
  - `components/Toolbar.scss`
  - `components/Tooltip.scss`
  - `components/UserList.scss`
  - `components/dropdownMenu/DropdownMenu.scss`
  - `components/footer/FooterCenter.scss`
  - `components/hyperlink/Hyperlink.scss`
  - `components/live-collaboration/LiveCollaborationTrigger.scss`
  - `css/app.scss`
  - `css/styles.scss`
  - `css/theme.scss`
  - `css/variables.module.scss`

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
