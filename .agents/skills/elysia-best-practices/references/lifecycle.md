# Elysia lifecycle (digest)

Sources: https://next.elysiajs.com/essential/life-cycle/ , https://next.elysiajs.com/essential/plugin/#scope ,
https://next.elysiajs.com/patterns/macro/ , and the installed `elysia@2.0.0-rc.1` declarations (`base.d.ts`).
Hook names and scope strings were checked there. The pipeline is the same in 1.4 except where the last
section says otherwise.
Read this when a hook does not fire, fires too widely, or sees the wrong context.

## Pipeline

| Stage | Hook | What it is for |
| --- | --- | --- |
| Request | `onRequest` | caching, rate limits, CORS headers; runs before route matching and before parsing |
| Parse | `onParse`, `parse:` | body parser; first parser to return a value wins; its return becomes `body` |
| Transform | `onTransform`, `transform:` | mutate context before validation (e.g. coerce a param) |
| Validation | schemas | `body`, `query`, `params`, `headers`, `cookie` |
| Before handle | `onBeforeHandle`, `derive` | authorisation; `derive` adds typed per-request values |
| Handler | route handler | skipped by any early return |
| After handle | `onAfterHandle` | inspect or replace the returned value (`responseValue`) |
| Map response | `mapResponse` | turn the value into a Web Standard `Response` |
| After response | `onAfterResponse` | logging, analytics, cleanup; runs after the response is sent |

Errors do not continue down the list; they go to `onError` (see `errors.md`). `defer(fn)` on the context
queues a callback to run after `afterResponse`. `derive` and `beforeHandle` share one queue and run in
registration order.

- An early return from `request`, `beforeHandle` or `derive` skips the handler. `afterHandle` still sees a
  `beforeHandle` short-circuit, but in 2.0 a returning `afterHandle` skips the remaining `afterHandle` hooks.
- `mapResponse` and `afterHandle` read the value as **`responseValue`**. The 1.x `response` field no
  longer exists (verified: `Property 'response' does not exist` on the 2.0 context type).
- A bodyless `GET`/`HEAD` no longer runs `parse` hooks. Work that must run on every request belongs in
  `onRequest` or `onTransform`.
- `onRequest` context has `request`, `set`, `store`, `status`, `redirect`, decorators and `server`; `body` and
  `headers` are not parsed yet.

## Local hook vs interceptor hook

- **Local hook**: a key in the route's hook object. Applies to that route only.
- **Interceptor hook**: a method on the instance (`.onBeforeHandle(fn)`). Applies to routes registered after it,
  subject to scope. `mapResponse` and `derive` have no `on` form.

```ts
import { Elysia } from 'elysia'

export const app = new Elysia()
  .get('/before', () => 'no header')
  .onAfterHandle(({ set }) => {
    set.headers['x-seen'] = 'yes'
  })
  .get('/after', () => 'has header')
  .get('/local', { afterHandle: ({ set }) => { set.headers['x-local'] = '1' } }, () => 'local only')
```

Prefer a local hook (or a macro) for behaviour that belongs to one route, and an early interceptor for
behaviour shared by a whole feature instance. Put shared interceptors **before** the routes and before `.use()`
of plugins they should reach.

## Scope

Scope is the first argument of a hook method: `'local'` (default), `'plugin'`, `'global'`. In the tree
`main > parent > current > child` where `current` owns the hook:

| Scope | child | current | parent | main |
| --- | --- | --- | --- | --- |
| `local` | yes | yes | no | no |
| `plugin` | yes | yes | yes | no |
| `global` | yes | yes | yes | yes |

(verified for `plugin`: only `/child`, `/cur` and `/par` fired the hook.)

- Reach a parent with the **string first argument**: `.onBeforeHandle('plugin', fn)`, `.derive('plugin', fn)`,
  `.guard('plugin', {...})`. Promote everything already on an instance with `.as('plugin')` or `.as('global')`.
- `plugin` goes one level up. To go further, call `.as('plugin')` on the parent too, or use `'global'`.
- Prefer `plugin` for anything a plugin's own users need (a `derive` whose type they read). Use `global` only for
  app-wide behaviour (tracing, logging) and for plugins that add no types.
- The 1.x object form `{ as: 'scoped' }` still typechecks in rc.1 but is marked `@deprecated`; `'scoped'` is now `'plugin'`.

## derive, decorate, state

| API | Lifetime | Typed on context as | Use for |
| --- | --- | --- | --- |
| `.state(k, v)` | app singleton, mutable | `store.k` | counters, caches (shared across requests: beware races) |
| `.decorate(k, v)` / `.decorate({...})` | app singleton | context property | services, clients |
| `.derive(fn)` | per request, after validation | context property | current user, per-request service |

- `derive` runs during `beforeHandle`. It replaces 1.x `resolve`; 1.x `derive` (before validation) is gone, so
  anything that must run before validation goes in `transform`.
- A `derive` may return `status(401, ...)` or an `Error` to stop the request; the early value is typed into the
  route's responses.
- `.derive(fn)` with a value that has `Symbol.dispose` / `Symbol.asyncDispose` is released after the response,
  on throw, on short-circuit and on disconnect. `decorate`/`state` values are never disposed; use `onStop`.
- `.decorate('override', k, v)` / `.state('append', ...)` choose the merge mode; the mode is the first argument.
- The old `app.store` / `app.decorator` instance getters are removed; read `store` from the handler context.

## Macros (auth and other per-route options)

A macro turns hooks, schema and context into a typed route option. Use one for authentication instead of a
guard when only some routes need it.

```ts
import { Elysia, t } from 'elysia'

export const auth = new Elysia({ name: 'auth' }).macro({
  user: {
    derive({ headers, status }) {
      const token = headers['authorization']
      if (!token) return status(401, 'Unauthorized')
      return { user: { id: token } }
    },
  },
})

export const app = new Elysia()
  .use(auth)
  .get('/me', { user: true }, ({ user }) => user.id)
  .get('/open', { query: t.Object({ q: t.String() }) }, ({ query }) => query.q)
```

(verified: `/me` without a header returns 401, with one returns the id; and `treaty(app).me.get()` types the
401 under `error.status`.)

- Only the object form `.macro({ name: def })` exists; `.macro(name, def)` is removed. A definition is an object
  or a function of the option's argument. Macro `resolve` is now `derive`.
- Macro hooks infer their own schema but not another macro's derived context. Combine dependent logic in one `derive`.
- Returning (not throwing) `status()` from a macro lets Eden and OpenAPI see the 401.
- Macros need TypeScript 5.7 or newer for inference.

## Differences from 1.4

- Hook object comes before the handler: `.get(path, hook, handler)`. The 1.x order typechecks in rc.1 but
  `.get('/x', handler, hook)` **throws at registration** ("is the 1.x order").
- `resolve` -> `derive`; `'scoped'` -> `'plugin'`; scope is a leading string, not `{ as }`.
- `onError` takes `(ErrorClass, handler)`; `error.code` and `.error()` are removed.
- Lifecycle method names keep their 1.x `onX` names. The beta dropped the `on` prefix; the RC reverted it, so 1.x
  plugins work unchanged.
