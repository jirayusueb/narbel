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
- `tsconfig.json` is upstream `packages/excalidraw/tsconfig.json`, re-rooted at `src/`, so the types land in `dist/types/{excalidraw,math,utils}` as in npm. `typeRoots` keeps the repo root's `@types/bun` out of TypeScript 4.9.
- `scripts/build.cjs` comes from upstream `scripts/buildPackage.js` and `env.cjs`. The differences:
  - `import.meta.env` is reduced to the keys the library reads.
  - `PKG_NAME` and `PKG_VERSION` are pinned to `@excalidraw/excalidraw` and `0.18.1`. Fonts load from `https://esm.sh/${PKG_NAME}@${PKG_VERSION}/dist/prod/`, so that URL stays the one in use today.
  - A Sass load path under `src/excalidraw` replaces the yarn-created `packages/excalidraw/node_modules`. Upstream resolved `UserList.scss`'s extensionless `@import "../css/variables.module"` against that folder.

The built `.d.ts` files match npm except for two things. The first is React type spellings from the newer `@types/react`. The second is 23 inline imports that tsc synthesizes: npm emits `import("@excalidraw/math")`, which never resolved for consumers, and the fork emits a relative `import("../../math")` into its own `dist/types/math`.

## Files changed under src/ versus upstream

None yet. Every edit to `src/` appends its path and the reason here.

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
