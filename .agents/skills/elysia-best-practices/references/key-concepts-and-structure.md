# Elysia key concepts and project structure (digest)

Sources: the "Key concepts" and "Best practice" pages of the Elysia 2 docs,
https://next.elysiajs.com/key-concept/ and https://next.elysiajs.com/essential/best-practice/ .
The older https://elysiajs.com/key-concept and https://elysiajs.com/essential/best-practice
describe 1.4 (hook after handler, `{ as: 'global' }`, `abstract class` services, `UnwrapSchema`
on a `models` object); where the two differ, this digest follows the 2.x pages, and every
signature was checked against the installed `elysia@2.0.0-rc.1` declarations.
Read this when deciding how to split an app into files, or why a type disappeared.

## Key concepts

1. **Lifecycle hooks are encapsulated per instance.** A hook added inside a plugin does not
   apply to the instance that `.use()`s it, like a non-exported function in a module. To
   export a hook, give it a scope: `.onBeforeHandle('global', fn)`.
2. **Method chaining is what carries types.** Every method returns a new `Elysia<...>` type.
   `const app = new Elysia(); app.state('build', 1); app.get(...)` leaves `app` typed as
   before the `state` call, so `store.build` is a type error. Chain, or reassign the result.
3. **Dependencies are explicit.** Each instance has its own context. `.use(other)`
   propagates `other`'s decorators, state, models and macros into the caller's types. There
   is no global type context, so an instance that forgets `.use(auth)` fails to compile
   instead of failing at runtime.
4. **Deduplication needs a `name`.** An unnamed plugin re-registers its hooks every time it is
   used. `new Elysia({ name: 'ip' })` registers once however many routers use it. A
   configurable plugin adds `seed` (usually its options); equal `name` + `seed` dedupe,
   different seeds stay distinct. Naming does not stop your factory function from running.
5. **Global vs explicit dependency.** Use a global hook for plugins that add no types (CORS,
   compression, security headers) and for app-wide tracing or logging. Use an explicit
   `.use()` for anything that adds types (macros, state, models) or business logic (auth,
   database, a feature module).
6. **Order of code matters.** A hook applies only to routes registered after it. The
   exception is `onRequest`, which runs before route matching. A parent hook reaches a
   mounted plugin's routes only if it was registered before `.use(plugin)`.
7. **Use inline handlers for inference.** Context types come from the route's schema and the
   instance's plugins, so write the handler inline and pass plain values to a function:
   `({ body }) => Controller.greet(body)`.

```ts
import { Elysia } from 'elysia'

const profile = new Elysia()
  .onBeforeHandle(({ cookie, status }) =>
    cookie['session']?.value ? undefined : status(401, 'no session')
  )
  .get('/profile', () => 'Hi there!')

// `/rename` does NOT inherit the check: the hook is local to `profile`.
export const app = new Elysia().use(profile).patch('/rename', () => 'renamed')
```

## Folder structure (best-practice page)

Elysia is unopinionated; absent a house style the docs recommend one folder per feature:

| Path | Role |
| --- | --- |
| `src/index.ts` | process entry; `app.listen(env.PORT)` only |
| `src/app.ts` | composes feature controllers and app-wide plugins; `export type App = typeof app` |
| `src/env.ts` | validated environment variables |
| `src/libs/` | shared clients and helpers with no Elysia import (db client, pure helpers) |
| `src/plugins/` | shared Elysia plugins: macros, request metadata |
| `src/routes/<feature>/index.ts` | controller: an Elysia instance, HTTP concerns only |
| `src/routes/<feature>/service.ts` | business rules and data access, independent of request context |
| `src/routes/<feature>/model.ts` | request and response schemas plus derived TypeScript types |
| `test/<feature>.test.ts` | controller and service tests |

- `.listen()` lives only in `index.ts` so tests and Eden can import `app` without opening a
  port. Importing `app` can still initialise configuration and database clients.
- Put a file in `libs/` or `plugins/` only when two features need it. A helper stays in its
  feature until a second feature wants it.
- Start small. A greeting route can live in `index.ts`; omit `model.ts` when no schema is shared.
  Grow a big `service.ts` by splitting by responsibility inside the same folder
  (`image.ts`, `storage.ts`, `permissions.ts`).
- 1.4 docs used `src/modules/<feature>/` with the same three files; the layout is a convention,
  not an API.

## Controller, service, model

- **Controller = an Elysia instance.** One instance is one controller. It does routing,
  validation binding, cookies, headers and redirects. Do not write a controller class that
  takes `Context`: Elysia's context type depends on every plugin and schema in the chain, so a
  class method typed `(context: Context)` loses type integrity. Destructure what you need and
  pass values: `({ params }) => getUser(params.id)`.
- **Service = ordinary functions with explicit inputs.** They may query the database, check
  ownership and run transactions. No repository layer is required just to wrap each call.
  Services stay out of request context, with one exception: they may return Elysia's `status()`
  or an `HTTPError` subclass, because those are "result" values Elysia can type.
- **Request-dependent logic is an Elysia instance**, not a class: a named plugin with a macro
  or `derive` (see `plugins.md`). `decorate` only singletons; overusing it ties code to Elysia.
- **Model = schemas plus derived types.** Derive TypeScript types from the schema instead of
  hand-writing an interface. Naming convention suggested by the docs: one exported object per
  route named `[Path][Method]` (`Post`, `ByIdGet`) holding `Body`, `Params`, `Query`,
  `Response`, and a type of the same name from `UnwrapModels<typeof Group>`. Import as
  `import * as UserModel from './model'`.

```ts
import { Elysia, t, type UnwrapModels } from 'elysia'

const Post = { Body: t.Object({ name: t.String() }) }
type Post = UnwrapModels<typeof Post>

function greet({ name }: Post['Body']) {
  return `Hello ${name}`
}

export const greeting = new Elysia({ prefix: '/greet' }).post(
  '/',
  { body: Post.Body },
  ({ body }) => greet(body)
)
```

- A schema used by one route stays next to that route. Register with `.model()` only when you
  want a named reference (OpenAPI component names, string references like `body: 'profile'`).
- Database schema and API model have different jobs. Drizzle/Prisma schemas can be converted to
  TypeBox or Standard Schema and reused, but check no sensitive column leaks into a response.

## Dependency injection

Elysia is "a composition root with typed context, not a container".

| Need | Use | Lifetime |
| --- | --- | --- |
| Singleton dependency | `.decorate({ db })`, or `.decorate((deps) => ({ ...deps, service }))` | whole app |
| Per-request dependency | `.derive(({ db }) => ({ service: new Service(db) }))` | one request |

A `derive` value that has `Symbol.dispose` or `Symbol.asyncDispose` is released after the
response (also on throw, short-circuit and client disconnect). `decorate` and `state` values
are never disposed; release them in `onStop`.

## Testing

Organise tests by feature. Test services directly for business rules, and use
`app.handle(url, init?)` for integration tests (see `testing.md`).
