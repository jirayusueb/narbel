---
name: elysia-best-practices
description: >-
  Write, review and migrate Elysia (elysiajs) TypeScript backends on Elysia 2.0: feature-folder
  structure, TypeBox and Standard Schema (zod) validation, lifecycle hooks and scope, plugins and
  deduplication, typed errors with status() and HTTPError, Eden treaty clients, and tests with
  app.handle. Use this whenever you write, review, refactor, debug, test or upgrade code that
  imports `elysia` or `@elysia/eden`: new Elysia(), .get/.post routes, t.Object schemas,
  derive/decorate/state, macros, guards, onError, treaty(), bun test on an app, 422/404/500
  responses, or an Elysia 1.4 to 2.0 migration, even when the user does not mention best practices.
  Synthesized from the Elysia 2 docs and the installed 2.0.0-rc.1 type definitions.
---

# Elysia best practices

Distilled from the Elysia 2 documentation (https://next.elysiajs.com) and checked against the installed
`elysia@2.0.0-rc.1` and `@elysia/eden@2.0.0-rc.1` declarations, with a digest of each topic in `references/`.
Target is Elysia 2; section 12 lists what differs from 1.4. Where the docs and the installed types disagree,
this file follows the types. Where the sources disagree, this file picks a side and says why.

## 1. Mindset

- **Never break the method chain.** Every Elysia method returns a new instance type that carries the new routes,
  state, decorators and models. `const app = new Elysia(); app.state('n', 1); app.get(...)` discards the `state`
  type, so Eden and the handler context lose it. Chain, or assign the result to a new variable.
- **One Elysia instance is one controller.** Group routes of a feature on one instance and compose with `.use()`.
  A controller class that takes `Context` cannot be typed, because Elysia's context depends on every plugin and
  schema in the chain.
- **Elysia is the HTTP layer, not the domain.** Keep business rules in plain functions or classes with explicit
  inputs that never import `Context`. They can still return `status()` or an `HTTPError`, which are values Elysia can type.
- **Write handlers inline.** Inference runs at the route declaration. Pass plain values onward:
  `({ body }) => createUser(body)`, never `.post('/', createUser)`.
- **Validate at the boundary and derive types from the schema.** One schema gives runtime checks, coercion,
  the TypeScript type, the Eden client type and the OpenAPI document. A hand-written interface next to it will drift.
- **Return expected failures; throw only the unexpected.** A returned `status()` or `HTTPError` is part of the
  route's type, so Eden and OpenAPI know about it. A thrown one is `unknown`.
- **Be explicit about dependencies.** There is no global type context. If a route needs `auth`, the instance
  must `.use(auth)`; a missing `.use` is a compile error, which is the point.

## 2. Before you hand back code

```bash
bunx tsc --noEmit        # Elysia's value is its types: a green build is the first test
bun test                 # app.handle / treaty(app) tests, no port needed
```

- Treat any `Property 'x' does not exist on type` on `store`, a decorator or `body` as a broken chain or a missing
  `.use()`, not as a reason to cast. Casting the context hides the very bug the types exist to catch.
- Search the diff for 1.x forms. Several still compile in rc.1 and fail at runtime or silently:

| Never write | Write | Why |
| --- | --- | --- |
| `.get('/x', handler, { body })` | `.get('/x', { body }, handler)` | rc.1 typechecks the old order but throws at registration |
| `.resolve(fn)` | `.derive(fn)` | `resolve` is removed; `derive` now runs in `beforeHandle` |
| `{ as: 'scoped' }`, `'scoped'` | `'plugin'` as the first argument | the object form is deprecated, `'scoped'` is renamed |
| `onError(({ code }) => ...)`, `.error()` | `onError(ErrorClass, fn)`, `instanceof` | `code` and `.error()` are removed |
| `({ response })` in `afterHandle` | `({ responseValue })` | `response` was removed from the context |
| `error(404, ...)` | `status(404, ...)` | `error()` was deprecated in 1.3 |
| `.macro('name', def)` | `.macro({ name: def })` | named form removed |
| `NotFoundError`, `t.Transform` | `NotFound`, `t.Codec` | renamed (TypeBox 1.0) |
| `@elysiajs/eden`, `@elysiajs/*` | `@elysia/eden`, `@elysia/*` | new npm scope for 1.4+ plugins |

## 3. Project structure

Elysia is unopinionated. Without a house style, use one folder per feature (the layout of the official
best-practice page):

```text
src/
  index.ts            app.listen(env.PORT) only
  app.ts              composes feature controllers; export type App = typeof app
  env.ts              validated environment variables
  libs/               shared clients and helpers, no Elysia import
  plugins/            shared Elysia plugins (macros, request metadata)
  routes/<feature>/
    index.ts          controller: an Elysia instance, HTTP concerns only
    service.ts        business rules and data access, no request context
    model.ts          request/response schemas and the types derived from them
test/<feature>.test.ts
```

- Keep `.listen()` in `index.ts` only, so tests and Eden import `app` without opening a port.
- A file belongs in `libs/` or `plugins/` only when two features use it. Keep helpers inside their feature until then.
- Start small: a one-route feature can live in `index.ts`; skip `model.ts` when no schema is shared.
- Controllers do HTTP (cookies, headers, redirects, status). Services do rules and persistence. A service
  that needs a cookie object is a controller concern leaking down.

The three files of one feature, shown in a single module so it typechecks (split at the comments):

```ts
import { Elysia, HTTPError, t, type UnwrapModels } from 'elysia'

// --- model.ts ---
export const ByIdGet = {
  Params: t.Object({ id: t.String({ format: 'uuid' }) }),
  Response: { 200: t.Object({ id: t.String(), name: t.String() }) },
}
export type ByIdGet = UnwrapModels<typeof ByIdGet>

// --- service.ts ---
export class UserNotFound extends HTTPError.id('USER_NOT_FOUND', 404) {}

const users = new Map([['9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d', 'Ada']])

export function getUser(id: ByIdGet['Params']['id']) {
  const name = users.get(id)
  if (name === undefined) return new UserNotFound('User not found')
  return { id, name }
}

// --- index.ts ---
export const user = new Elysia({ prefix: '/user' }).get(
  '/:id',
  { params: ByIdGet.Params, response: { 200: ByIdGet.Response[200] } },
  ({ params }) => getUser(params.id)
)
```

## 4. Validation and models

- **Validate every `body`, `query`, `params` and `headers` that a handler reads.** An unvalidated `body` is `unknown`
  at the edge of your system; the schema is the only thing between a client and your database.
- **Use `t` by default.** It coerces `t.Number()` and `t.Boolean()` in `params`, `query` and `headers`, understands
  files and cookies, and feeds OpenAPI. Use zod (or another Standard Schema library) when the project already shares
  schemas with a frontend; then coerce explicitly (`z.coerce.number()`), because Elysia only coerces `t`.
- **A number inside a JSON body stays a number.** `{"id":"10"}` fails `t.Object({ id: t.Number() })`; only path, query
  and header fields convert from strings.
- **Derive types, never duplicate them.** `UnwrapSchema<typeof S>` for one `t` schema, `UnwrapModels<typeof Group>`
  for a group, `z.infer` for zod. Use the derived type as the service's parameter and return type so a schema change
  breaks the service at compile time.
- **Give routes a `response` schema when the shape is a contract.** It is the source of the Eden response type
  and strips fields you did not declare. Map statuses to schemas (`{ 200: ..., 404: ... }`) and return `status(404, ...)`.
- **Prefer `schema: 'merge'` deliberately.** In 2.0 a route's schema replaces an inherited guard schema; add
  `schema: 'merge'` to the guard only when both must hold.
- **A guard applies to every later route**, including `GET`s: register read routes first, or isolate them in another instance.
- **Register with `.model()` only for names.** A plain exported `const` already shares a schema; `.model({ profile })` and
  `body: 'profile'` buy named OpenAPI components and completion.

```ts
import { Elysia, t, type UnwrapSchema } from 'elysia'

const Signup = t.Object({
  email: t.String({ format: 'email' }),
  age: t.Optional(t.Number({ minimum: 18 })),
})
type Signup = UnwrapSchema<typeof Signup>

const Page = t.Object({ page: t.Number({ minimum: 1 }), tags: t.Array(t.String()) })

function register(input: Signup) {
  return { id: crypto.randomUUID(), email: input.email }
}

export const app = new Elysia()
  .post('/signup', { body: Signup }, ({ body }) => register(body))
  // ?page=2&tags=a,b  ->  { page: 2, tags: ['a', 'b'] }
  .get('/list', { query: Page }, ({ query }) => query)
```

## 5. Lifecycle and hooks

Order: `onRequest` -> `onParse` -> `onTransform` -> validation -> `onBeforeHandle`/`derive` -> handler -> `onAfterHandle`
-> `mapResponse` -> `onAfterResponse`. Errors go to `onError`.

| Need | Hook |
| --- | --- |
| Rate limit, CORS, cache before any parsing | `onRequest` |
| Coerce or normalise input before validation | `onTransform` (or a coercing schema) |
| Authorisation, typed per-request value (current user) | `derive` or a macro |
| Check after validation, short-circuit | `onBeforeHandle` |
| Rewrite the returned value | `onAfterHandle` (reads `responseValue`) |
| Set `content-type`, map to a `Response` | `mapResponse` |
| Logging, metrics, cleanup | `onAfterResponse` |

- **Prefer local hooks and macros to instance-wide hooks.** A hook in the route's options affects that route and is
  visible where the behaviour lives. Use an instance hook only for a whole feature, and register it **before** the
  routes (and before `.use()` of plugins) it should reach: hooks apply only to what is registered after them.
- **Scope is the first argument.** `'local'` (default: this instance and its children), `'plugin'` (also the immediate
  parent), `'global'` (every ancestor). Prefer `'plugin'` for what a plugin's users depend on; reserve `'global'`
  for tracing, logging and plugins that add no types.
- **`derive` for per-request values, `decorate` for singletons.** `derive` runs after validation; return `status(401, ...)`
  from it to stop the request. A derived value with `Symbol.asyncDispose` is released after the response.
- **Authenticate with a macro**, so the route says what it needs (`{ user: true }`) and the context type follows.

```ts
import { Elysia, t } from 'elysia'

export const auth = new Elysia({ name: 'auth' }).macro({
  user: {
    derive({ headers, status }) {
      const token = headers['authorization']
      if (!token) return status(401, 'Unauthorized')
      return { user: { id: token.replace('Bearer ', '') } }
    },
  },
})

export const notes = new Elysia({ prefix: '/notes' })
  .use(auth)
  .get('/', { detail: { summary: 'public' } }, () => [])
  .post('/', { user: true, body: t.Object({ text: t.String() }) }, ({ user, body }) => ({
    owner: user.id,
    text: body.text,
  }))
```

## 6. Plugins and dependency injection

- **Name every plugin that more than one instance will use**: `new Elysia({ name: 'auth' })`. Without a `name` its hooks
  register once per `.use()`. For a configurable plugin add `seed` (its options): equal name + seed dedupe.
- **A plugin is an instance.** Return a new `Elysia` from a factory instead of the `(app) => app` callback form; the
  callback blurs encapsulation. Naming dedupes registration but your factory still runs on each call, so open pools outside it.
- **Add types explicitly.** A plugin that adds a macro, decorator, state or model is a dependency: `.use()` it where
  it is read. Plugins that add no types (CORS, compression, headers) can be global.
- **Keep `decorate` for singletons and request-bound wiring, and `derive` for per-request services.** A service that
  needs nothing from the request is imported directly, not decorated; decorating ties it to Elysia and to test setup.
- **Use `state` sparingly.** It is mutable memory shared by all requests; never keep per-user data in it.
- **Release what you create.** `decorate`/`state` values are never disposed; clean up in `onStop`. A `derive`d value
  implementing `Symbol.dispose` is released per request.

```ts
import { Elysia } from 'elysia'

class Db {
  find(id: string) {
    return { id, name: 'Ada' }
  }
}
class UserService {
  private readonly db: Db
  constructor(db: Db) {
    this.db = db
  }
  get(id: string) {
    return this.db.find(id)
  }
}

export const users = new Elysia({ name: 'users' })
  .decorate({ db: new Db() })
  .derive(({ db }) => ({ users: new UserService(db) }))
  .get('/users/:id', ({ users, params }) => users.get(params.id))
```

## 7. Errors

- **Return `status(code, body)` for a one-off expected outcome** in a handler, hook or macro. The code and body type
  travel together into Eden.
- **Use `HTTPError.id('CODE', status)` subclasses for failures that recur** (services, several routes). The class gives
  a stable `code` for clients and a status Elysia sends without any `onError`.
- **Return the error, do not throw it**, so TypeScript sees it. A returned `Error` still goes through `onError`.
- **Map foreign errors with `.onError(ErrorClass, handler)`** (ORM, SDK). Catch-all `.onError(fn)` narrows with
  `instanceof`; `error.code` no longer exists.
- **Register `onError` before the routes.** It is an ordinary hook: routes defined earlier do not get it.
- **Never put internals in `detail`.** Every Elysia error is an RFC 9457 `application/problem+json` document. With
  `NODE_ENV=production` Elysia drops `detail`, `name` and validation `found`/`errors` from unhandled errors and 422s, but a
  `detail` you wrote on an `HTTPError` is sent as written.
- **Set `NODE_ENV=production` in deployments**, or 500s include the error message.

```ts
import { Elysia, HTTPError, NotFound, problem, t } from 'elysia'

class OutOfStock extends HTTPError.id('OUT_OF_STOCK', 409) {
  override detail = 'That item is out of stock'
}

function reserve(sku: string) {
  return sku === 'sold-out' ? new OutOfStock() : { sku, reserved: true }
}

export const shop = new Elysia()
  .onError(NotFound, () => problem(404, { detail: 'No such route' }))
  .post('/reserve', { body: t.Object({ sku: t.String() }) }, ({ body }) => reserve(body.sku))
```

## 8. Responses

- **Return values.** A string, object, `Response`, `file()`, `form()` or generator is the response. Hooks can still
  change headers and status, so a literal handler is not a cache.
- **Return `status()` rather than writing `set.status`** wherever a status code accompanies a body: only `status()`
  keeps the code tied to its body type. Use `set.status` only in a hook that picks a default and leaves the body to the handler.
- **Set headers with `set.headers['x-name']`** (lowercase names). Set them before the first `yield` of a stream.
- **Use `redirect(url, status?)` from context**, not `set.redirect` (removed). Return it.
- **Stream with generators.** `function*`/`async function*` and `yield`; wrap values in `sse(...)` for server-sent events.
  Returning before the first `yield` sends a normal response. The generator closes if the client cancels, but pending
  `await`s keep running: pass `request.signal` to work that supports it.
- **Cookies are a proxy that is never `undefined`**; read and write `cookie.name.value`. Give it a `t.Cookie` schema to
  type the value and avoid `!`.
- **Return a fresh `Response` per request** when you also write `set.headers`; a shared object is mutated.

```ts
import { Elysia, sse, t } from 'elysia'

export const app = new Elysia()
  .get('/teapot', ({ status }) => status(418, 'I am a teapot'))
  .get('/seen', { cookie: t.Cookie({ seen: t.Optional(t.String()) }) }, ({ cookie: { seen } }) => {
    const previous = seen.value ?? 'never'
    seen.value = new Date().toISOString()
    return { previous }
  })
  .get('/events', function* ({ set }) {
    set.headers['cache-control'] = 'no-store'
    yield sse('brewing')
    yield sse({ event: 'ready', data: { tea: 'Earl Grey' } })
  })
```

## 9. Eden

- **Export the type, not the app value**: `export type App = typeof app` and `import type { App }` in clients, so client
  code never imports server runtime.
- **Create the client from the type**: `treaty<App>('localhost:3000')`. Pass the instance instead (`treaty(app)`) in tests.
- **Check `error` before using `data`.** `data` is `T | null` until then. Switch on `error.status` to narrow `error.value`.
- **Dynamic segments are calls with an object**: `api.users({ id }).get()`. The 1.x bracket form is a type error.
- **Never pre-encode path or query values.** Eden already applies `encodeURIComponent`. Passing `encodeURIComponent(email)`
  sends `%2540`, the server decodes once and sees the literal text `a%40b.co`, and the lookup misses: a `404` for every email.
- **Keep client and server on the same Elysia version** and turn on `strict`. Duplicate copies degrade inference to `any`.
- **Do not throw from the client for expected statuses.** Reserve `throwHttpError: true` for call sites that want a throw.

```ts
import { Elysia, t } from 'elysia'
import { treaty } from '@elysia/eden'

const app = new Elysia().get('/members/:email', { params: t.Object({ email: t.String() }) }, ({ params, status }) =>
  params.email.includes('@') ? { email: params.email } : status(404, 'unknown member')
)
export type App = typeof app

const api = treaty<App>('localhost:3000')

export async function findMember(email: string) {
  // Right: pass the raw value. Wrong: encodeURIComponent(email).
  const { data, error } = await api.members({ email }).get()
  if (error) {
    if (error.status === 404) return undefined
    throw new Error('lookup failed')
  }
  return data.email
}
```

## 10. Testing

- **Test behaviour through the app, rules through services.** `app.handle` for status, headers, validation and auth;
  plain function tests for service logic; `treaty(app)` when the test should also fail to compile on a contract change.
- **Use absolute URLs** (`http://localhost/...`) and send `content-type: application/json` with a JSON string body.
- **Compose the real app** the server uses, so parent hooks (error mapping, auth) are exercised.
- **`await app.modules`** before requesting a route from an async or lazy plugin; `app.handle` does not wait for it.
- **Assert on status and the problem `code`**, not on English `detail` text.
- **Include `test/` in `tsconfig.json`** and run `tsc --noEmit`; that is the type-level test of the Eden client.

```ts
import { describe, expect, it } from 'bun:test'
import { Elysia, t } from 'elysia'
import { treaty } from '@elysia/eden'

const app = new Elysia().post('/sum', { body: t.Object({ a: t.Number(), b: t.Number() }) }, ({ body }) => ({
  total: body.a + body.b,
}))

describe('sum', () => {
  it('rejects a bad body with a problem document', async () => {
    const res = await app.handle('http://localhost/sum', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ a: 1, b: 'x' }),
    })
    expect(res.status).toBe(422)
    expect(res.headers.get('content-type')).toContain('application/problem+json')
  })

  it('adds, typed end to end', async () => {
    const { data, error } = await treaty(app).sum.post({ a: 1, b: 2 })
    expect(error).toBeNull()
    expect(data?.total).toBe(3)
  })
})
```

## 11. Performance and AOT

Only what the docs state:

- Elysia compiles an optimised function per route on the **first request** to that route (JIT). Ahead-of-time (AOT) compilation
  moves that to the build step. It gives faster startup and first requests, lower peak memory, less runtime code (TypeBox can
  be dropped when every schema compiles) and precomputed default merging, at the cost of some generated code in the bundle.
- To use AOT, export the instance as `app` (or `default`), and build with `aot()` from `elysia/plugin/aot/bun` (or `vite`,
  `esbuild`, `rspack`, `unplugin`). If several apps are built, name each one uniquely and keep names static.
- Guard external side effects (database connections) with `inAotBuild()`, since the build dry-runs your entry.

## 12. Elysia 1.4 vs 2.0

| Topic | 1.4 | 2.0 (rc.1) |
| --- | --- | --- |
| Route arguments | `.get(path, handler, hook)` | `.get(path, hook, handler)`; old order throws at registration |
| Per-request context | `resolve` (after validation), `derive` (before) | `derive` (in `beforeHandle`); `resolve` removed |
| Scopes | `local`, `scoped`, `global`; `{ as }` | `local`, `plugin`, `global`; leading string |
| Guard/group schemas | additive | nearer overrides; `schema: 'merge'` for both |
| Errors | `error.code`, `.error()`, bare strings | `onError(Class, fn)`, `HTTPError.id`, `problem()`, RFC 9457 bodies |
| Response value in hooks | `response` | `responseValue` |
| Macros | `.macro(name, def)`, `resolve` | `.macro({ name: def })`, `derive` |
| TypeBox | 0.34 `t.Transform` | TypeBox 1.0 `t.Codec` |
| Eden | `@elysiajs/eden`, bracket paths | `@elysia/eden`, `api.x({ id })` |
| Plugins | `@elysiajs/*` | `@elysia/*` |
| WebSocket | built in | `.use(websocket())` from `elysia/websocket` |
| Lifecycle names | `onX` | `onX` (the beta dropped the prefix; the RC restored it) |
| Production errors | message may leak | message and `detail` omitted when `NODE_ENV=production` |

Run `bunx @elysia/codemod --check`, then `bunx @elysia/codemod`; it handles the mechanical rows, and prints warnings for `error.code`,
`.error()`, `set.redirect`, `onParse` content-type parameters and `.mount(instance)`.

## References

Read the digest that matches the task. Each lists its sources.

- `references/key-concepts-and-structure.md` (https://next.elysiajs.com/key-concept/, /essential/best-practice/): encapsulation,
  chaining, dedup, order of code, folder layout, controller/service/model, dependency injection.
- `references/validation.md` (/essential/validation/, /patterns/typebox/, /patterns/openapi/#reference-model): schema slots, `t` vs
  Standard Schema, coercion rules, derived types, guards, validation errors.
- `references/lifecycle.md` (/essential/life-cycle/, /patterns/macro/): pipeline, local vs interceptor hooks, scope table,
  `derive`/`decorate`/`state`, macros.
- `references/plugins.md` (/essential/plugin/): plugins as instances, explicit dependencies, `name`/`seed` dedup, guard/group, lazy plugins.
- `references/errors.md` (/patterns/error-handling/, /essential/handler/#status): `status`, `problem`, `HTTPError`, `onError`, built-in
  errors, what the client sees in production.
- `references/eden.md` (/eden/*, installed `@elysia/eden`): setup, path mapping, the path-param encoding gotcha, response handling, config.
- `references/testing.md` (/patterns/unit-test/, /eden/treaty/unit-test/): `app.handle`, treaty in tests, auth, errors, services.
- `references/migration-1.4-to-2.0.md` (/blog/elysia-20-rc/, /blog/elysia-20/, the early migration guide, `@elysia/codemod`):
  every breaking change, what the RC reverted, behaviour changes, order of work.
