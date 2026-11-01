# Elysia plugins, encapsulation and deduplication (digest)

Sources: https://next.elysiajs.com/essential/plugin/ , https://next.elysiajs.com/key-concept/ ,
https://next.elysiajs.com/essential/best-practice/#dependency-injection , and the `ElysiaConfig` declaration in
the installed `elysia@2.0.0-rc.1` (`types.d.ts`: `name`, `seed`, `prefix`, `as`).
Read this when splitting an app into instances, sharing typed context, or when a plugin's routes run twice.

## What a plugin is

A plugin is any Elysia instance (or a function from instance to instance, or a promise of one). Every instance
runs standalone and can be `.use()`d by another. That is the whole module system.

```ts
import { Elysia } from 'elysia'

const users = new Elysia({ prefix: '/users' }).get('/', () => ['ada'])
const health = new Elysia().get('/health', () => 'ok')

export const app = new Elysia().use(users).use(health)
```

Prefer returning a **new instance** over the functional form `(app: Elysia) => app.get(...)`. The callback form
receives the parent directly, which blurs encapsulation and gives TypeScript a weaker boundary. Instances are
lightweight; there is no performance reason to pick the callback.

## Encapsulation and dependency

- Each instance owns its own context. `.use(auth)` is the declaration that `main` depends on `auth`; without it,
  `main`'s handlers do not type-check against `auth`'s decorators, state, models or macros.
- Hooks stay local unless given a scope (`lifecycle.md`). Decorators, state and models of a used plugin are visible to
  the user; the plugin's **hooks** are what scope controls.
- A plugin that adds types (macro, decorate, derive, model) is an *explicit* dependency: each instance that needs it
  `.use()`s it. A plugin that adds no types (CORS, compression, security headers, tracing, logging) can be global.
- Registration order still applies: sharing a hook through `.use()` does not apply it to routes registered earlier.

## Deduplication

An unnamed plugin re-registers its hooks every time it is used. Give shared plugins a `name`:

```ts
import { Elysia } from 'elysia'

const requestId = new Elysia({ name: 'request-id' }).derive('global', () => ({
  requestId: crypto.randomUUID(),
}))

const a = new Elysia().use(requestId).get('/a', ({ requestId }) => requestId)
const b = new Elysia().use(requestId).get('/b', ({ requestId }) => requestId)

// `requestId` is registered once on `app`, though both routers use it.
export const app = new Elysia().use(a).use(b)
```

- Identity is `name` plus `seed`. For a configurable plugin pass its options as `seed`: equal options dedupe,
  different options stay distinct.
- Naming dedupes registration. It does **not** stop your factory function from running each call, so keep one-time
  work (opening a pool) outside the factory.
- (verified: a named plugin's `onRequest` ran once per request, not twice, when two routers used it.)

```ts
import { Elysia } from 'elysia'

export const version = (value = 1) =>
  new Elysia({ name: 'version', seed: value }).get('/version', () => value)
```

## Dependency injection with typed context

Elysia is a composition root, not a container. Wire singletons with `decorate`, per-request values with `derive`:

```ts
import { Elysia } from 'elysia'

class Db {
  find(id: string) {
    return { id, name: 'ada' }
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

- `decorate` for what lives as long as the app; `derive` for what lives for one request. If the per-request value has
  `Symbol.asyncDispose`, Elysia disposes it after the response.
- Keep `decorate` for request-bound or singleton wiring. A service that needs nothing from the request is a plain
  function or class imported directly; decorating it only couples it to Elysia.
- `state` is shared mutable memory across all requests. Use it for caches and counters only, never for per-user data.

## Guard and group

- `.guard({ body, beforeHandle }, (app) => app.post(...))` applies a hook/schema to routes inside the callback.
  Without the callback it applies to all later routes on the instance.
- `.group('/v1', { body }, (app) => ...)` takes prefix, guard options and callback.
- 2.0: the nearer schema **replaces** an inherited one; add `schema: 'merge'` to require both.
- Passing a scope to a guard (`.guard('plugin', {...})`) exports its hooks and schemas to the parent.

## Lazy and async plugins

- An async plugin (`async (app) => ... return app`) or `.use(import('./plugin'))` registers once its promise
  settles. `.listen()` and `app.fetch` wait for all pending modules.
- `app.handle()` does not wait: in tests, `await app.modules` before requesting a deferred route.
- The lazy module must export the plugin as its default export.

## Configuration worth knowing

`new Elysia({ name, seed, prefix, as, adapter, serve, detail, precompile, ... })`. `prefix` replaces the removed
`.prefix()`/`.affix()`/`.suffix()` methods. `as: 'plugin' | 'global'` in the constructor sets the instance's scope
for everything registered on it.

## Official plugins

Official plugins moved from `@elysiajs/*` to `@elysia/*` for Elysia 1.4+ (`@elysia/openapi` replaces swagger,
`@elysia/eden`, `@elysia/compress`). `@elysiajs/*` remains for 1.x-era plugins; the codemod renames imports.
