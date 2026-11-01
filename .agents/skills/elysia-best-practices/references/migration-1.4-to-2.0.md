# Elysia 1.4 to 2.0 migration (digest)

Sources, newest first:
1. the installed `elysia@2.0.0-rc.1` and `@elysia/eden@2.0.0-rc.1` declarations and runtime (ground truth);
2. https://next.elysiajs.com/blog/elysia-20-rc/ (RC post, 19 Oct 2026) and the 2.x docs under https://next.elysiajs.com;
3. https://next.elysiajs.com/blog/elysia-20/ (beta post, "Breaking Change" and "Additional Change");
4. the early migration guide, https://github.com/elysiajs/elysia/pull/1873#issuecomment-4734573873 ;
5. the codemod README, https://www.npmjs.com/package/@elysia/codemod (published `latest` is `2.0.0-rc.0`).
The beta post and the early guide **predate the RC**; two things they describe were changed in the RC (see "Reverted"). Where a
source disagrees with the installed types, the types win. The https://elysiajs.com docs are still the 1.4 docs.
Read this when upgrading an app or when copied 1.x code fails to compile or throws at startup.

## Do first

1. `bun add elysia@rc @elysia/eden@rc` (peer dependencies: `typebox >= 1.3.0`, `exact-mirror >= 1.2.6`, `openapi-types`,
   optional `typescript >= 5.7`; Node >= 22.18).
2. Run `bunx @elysia/codemod --check` (dry run), then `bunx @elysia/codemod`. It rewrites the mechanical items below and prints
   `warning[...]` for the manual ones. Review the diff; chained calls may collapse onto one line.
3. `tsc --noEmit`, then `bun test`. Several 1.x forms typecheck but fail at runtime (marked **runtime**).

## What changed

| Area | 1.4 | 2.0 rc.1 | Codemod |
| --- | --- | --- | --- |
| Route arguments | `.get(path, handler, hook)` | `.get(path, hook, handler)`. The 1.x order still typechecks but **throws at registration** (`is the 1.x order; Elysia 2 takes (path, hook, handler)`) (**runtime**) | yes |
| Per-request context | `.resolve(fn)` (after validation); `.derive(fn)` (before validation) | `.derive(fn)` runs in `beforeHandle`; `.resolve` and `.mapResolve` removed (`.mapDerive` exists) | yes |
| Scope name | `'scoped'` | `'plugin'` (`local`, `plugin`, `global`) | yes |
| Scope syntax | `.onBeforeHandle({ as: 'scoped' }, fn)`, `.guard({ as })` | leading string: `.onBeforeHandle('plugin', fn)`, `.guard('plugin', {...})`; the object form still typechecks on hooks but is `@deprecated`, and `.guard({ as })` throws | yes |
| decorate/state mode | `.decorate({ as: 'override' }, 'db', db)` | `.decorate('override', 'db', db)` | yes |
| Guard/group schema | inherited schemas merge (additive) | nearer schema **overrides**; `schema: 'merge'` to require both (`'override' \| 'merge'`) | adds `schema: 'merge'` |
| `onError` | `({ code, error })`, `.error('CODE', Class)` | `.onError(Class, handler)` or `.onError(fn)` narrowing with `instanceof`; `error.code` and `.error()` removed | warns |
| Error responses | bare string or JSON | RFC 9457 problem document, `application/problem+json`; returned or thrown errors both reach `onError` | no |
| Custom errors | `class X extends Error` plus `.error()` | `class X extends HTTPError.id('CODE', 404)` (or implement `HTTPError`) | no |
| `error()` helper | deprecated in 1.3 for `status()` | `status()` (also a named export) and `problem()` | no |
| `afterHandle`/`mapResponse`/`afterResponse` | `response` field | `responseValue` (**type error** on `response`) | warns |
| Macros | `.macro('name', def)`; `resolve` key | only `.macro({ name: def })`; `derive` key; needs TypeScript >= 5.7 | yes |
| TypeBox | `t.Transform` | TypeBox 1.0: `t.Codec`; `t.Recursive`, `t.Not`, `t.RegExp` not exported; `t.NoValidate` skips `Check` only | `Transform` only |
| 404 class | `NotFoundError` | `NotFound` | yes |
| Schema validator helper | `getSchemaValidator(s)` | `Validator.create(s)` | yes |
| Redirect | `set.redirect = url` | `({ redirect }) => redirect(url)` | warns |
| `onParse` | `(ctx, contentType)` | `(ctx) => ctx.contentType` | warns |
| Schema to type | `typeof S.static` | `UnwrapSchema<typeof S>` (`.static` is absent from the 2.0 `t` types, verified) | no |
| Instance API | `.route()`, `.connect()`, `.env()`, `.affix()/.prefix()/.suffix()`, `app.store`/`app.decorator`/`app.config` getters | removed: use verb methods, `new Elysia({ name, prefix })`, and `store`/`decorator` from context | warns |
| `.mount(instance)` | accepted | deprecated: `.use(instance)` (`.mount(fetchHandler)` still fine) | warns |
| WebSocket | `.ws(path, bunOptions)` built in | opt-in `import { websocket } from 'elysia/websocket'`, `.use(websocket())`; generators/`yield` preferred over `ws.send`; `ws.data` inlined; 3-arg form `.ws(path, options, handler)` | yes |
| Trace | `.trace(fn)` | `.use(trace())` from `elysia/trace` | yes |
| Dynamic mode | `aot: false` | removed ("replaced by AOT mode"); routes compile at first request, or at build time with `elysia/plugin/aot/{bun,vite,esbuild,rspack,unplugin}` | no |
| `file-type` | bundled | removed; call `setFileTypeDetector(fileTypeFromBlob)` once or typed `t.File` uploads always fail | warns |
| Plugin packages | `@elysiajs/*` | `@elysia/*` (`@elysia/openapi` replaces swagger, plus `@elysia/compress`) | yes |
| Eden package | `@elysiajs/eden` | `@elysia/eden` (peer `elysia >= 2.0.0-rc.0`) | yes |
| Eden dynamic path | `api.item['skadi']` (Treaty 1) | `api.item({ name: 'skadi' })`; bracket form is a type error | no |
| Node adapter | own layer | `srvx` and `crossws` under the hood | n/a |

## Reverted between beta and RC

- **Lifecycle names.** The beta dropped the `on` prefix (`beforeHandle(...)` as a method). The RC restored `onRequest`, `onParse`,
  `onTransform`, `onBeforeHandle`, `onAfterHandle`, `onAfterResponse`, `onError`, `onStart`, `onStop`. `mapResponse` and `derive`
  never had an `on` form. 1.x plugins that only use lifecycle hooks work unchanged.
- **The two-parameter `onError`** is the one lifecycle form that remains breaking.
- The early guide still shows `app.error(NotFound, ...)` and macro `resolve`; in rc.1 these are `.onError(NotFound, ...)` and `derive`.
- The early guide says guards need `schema: 'standalone'`; rc.1's values are `'override' | 'merge'`, and `merge` is the additive one.

## Behaviour changes with no syntax change

- `afterHandle` returning a value skips the remaining `afterHandle` hooks.
- Bodyless `GET`/`HEAD` do not run `parse` hooks; use `onRequest`/`onTransform` for every-request work.
- `context.path` is read-only. Schemas are cloned on first registration; validation `expected` values are shared and frozen.
- A value returned from `onRequest` now passes through `mapResponse` before being sent.
- Signed cookies verify `lazy` by default; secrets rotating with a `null` (allow unsigned) entry no longer throw for dotted values.
- 422 bodies over 4 KB are not echoed back in `found`.
- Unhandled errors no longer leak `message` when `NODE_ENV=production`; generic `Error` and any `ElysiaError` with status >= 500 and no
  explicit `response` answer `Internal Server Error`; the mapped error JSON drops `cause`.
- A returned `Response` object is passed through by reference when `set` is untouched: returning the **same** `Response` across requests
  while writing per-request `set.headers` mutates the shared object. Return a fresh `Response` each time.
- `application/xml` no longer parses as urlencoded; unknown content types return `415`.
- `context.server` is `null` for a direct `app.handle()`.
- Dynamic routes match a trailing slash under the default `strictPath: false`.

## New in 2.0 worth adopting

- `HTTPError.id()`, `problem()`, `HTTPError.typeBase`; statically analysable errors that Eden and OpenAPI type generation read.
- `derive` values with `Symbol.dispose`/`Symbol.asyncDispose` are released after the request.
- `defer(fn)` on the context: run work after `afterResponse`.
- `.handle(url, init?)` accepts a URL string.
- Macro type lambdas and Eden plugins (opt-in, advanced).
- AOT compilation plugin for faster startup and lower peak memory; it can remove TypeBox entirely when every schema compiles.

## Order of work for a real migration

1. Dependencies and codemod, commit that alone.
2. Fix compile errors (`response`, `code`, `.error`, `resolve`, `NotFoundError`).
3. Run the app: any `is the 1.x order` throw means a verb call the codemod could not swap (non-inline handler or a comment between arguments).
4. Re-check every `guard`/`group` for override vs merge semantics.
5. Replace thrown strings and `set.status` with returned `status()`/`HTTPError`; update any non-Eden client that parsed plain-text errors.
6. Run client type checks with `treaty<App>` after bumping `@elysia/eden`.
