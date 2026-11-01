# Eden Treaty: end-to-end types (digest)

Sources: https://next.elysiajs.com/eden/ , /eden/installation/ , /eden/treaty/overview/ , /eden/treaty/parameters/ ,
/eden/treaty/response/ , /eden/treaty/config/ , /eden/treaty/unit-test/ (all under https://next.elysiajs.com), and the
installed `@elysia/eden@2.0.0-rc.1` (`dist/index.d.ts`, `dist/treaty2.d.ts`, the shipped `.mjs`). "(verified)" means
run against that install.
Read this when a client call has the wrong type, `data` is nullable, or a path parameter arrives mangled.

## Setup

- Package is **`@elysia/eden`** (1.x: `@elysiajs/eden`). Install `@elysia/eden@rc` on the client and `elysia@rc` as a dev
  dependency so it can infer types. `elysia` is a peer dependency (`>= 2.0.0-rc.0`).
- Client and server must resolve the **same Elysia version**; check with `bun pm why elysia` / `npm why elysia`.
  Duplicate copies make inference silently degrade.
- `strict: true` is required in the client's `tsconfig.json`. Docs list TypeScript 5.9 or newer.
- The server must use **method chaining**, or the exported type has no routes.
- Export the type, not the value, so client code does not import server runtime:

```ts
import { Elysia, t } from 'elysia'

export const app = new Elysia()
  .get('/hi', () => 'Hi Elysia')
  .get('/id/:id', ({ params }) => params.id)
  .post('/mirror', { body: t.Object({ id: t.Number(), name: t.String() }) }, ({ body }) => body)

export type App = typeof app
```

```ts skip
import { treaty } from '@elysia/eden'
import type { App } from './server-app'

const api = treaty<App>('localhost:3000')

const { data, error } = await api.mirror.post({ id: 1, name: 'Skadi' })
if (error) throw error
console.log(data.name)
```

(The second block assumes the first lives in `server-app.ts`; keep the import as `import type`.)

- With a monorepo path alias (`@/...`) the client's `tsconfig` must resolve the alias to the **same file** as the
  server, or inference collapses to `any`. Prefer namespaced aliases (`@backend/*`).
- Returning Bun-specific values (`Bun.file`) requires `@types/bun` on the client too.

## Path to call mapping

| Server route | Client call |
| --- | --- |
| `GET /hi` | `api.hi.get()` |
| `GET /` | `api.get()` |
| `POST /deep/nested` | `api.deep.nested.post(body)` |
| `GET /id/:id` | `api.id({ id: 1895 }).get()` |
| `GET /item/:name/id` | `api.item({ name: 'Skadi' }).id.get()` |

- A dynamic segment is a **function call taking an object** keyed by the parameter name. The 1.x bracket form
  `api.item['skadi']` is a type error in Treaty 2 (verified). Legacy `edenTreaty` still exports for the old API.
- Pass an Elysia instance instead of a URL (`treaty(app)`) to call it in-process with no network: type inferred from the
  argument, no generic needed. This is the recommended way to unit test.

## Gotcha: never pre-encode path params

**Eden already runs `encodeURIComponent` on path parameters** (and on query keys and values; object query values are
`JSON.stringify`d). Passing an already-encoded value encodes it twice.

```ts
import { Elysia } from 'elysia'
import { treaty } from '@elysia/eden'

const app = new Elysia().get('/members/:email', ({ params }) => params.email)
const api = treaty(app)

// Right: the raw value. Eden sends /members/a%40b.co and the handler sees "a@b.co".
const ok = await api.members({ email: 'a@b.co' }).get()

// Wrong: "a%40b.co" is encoded again to "a%2540b.co"; the handler sees the literal text "a%40b.co".
const bad = await api.members({ email: encodeURIComponent('a@b.co') }).get()

console.log(ok.data, bad.data)
```

(verified: `ok.data` is `a@b.co`, `bad.data` is `a%40b.co`.) In a real app the second value matches no row, so the
symptom is a `404` or empty result for any id containing `@`, `/`, space or `%`. The same applies to `query`. If a
call fails only for "special" ids, look for a hand-written `encodeURIComponent` in the caller first.

## Parameters

Methods take at most two arguments:

1. `body` (only for non-`GET`/`HEAD`). Pass `null` or `undefined` when the body is optional but `query` or `headers` are needed.
2. Options: `{ query, headers, fetch }`. `fetch` forwards any `RequestInit` (e.g. `signal` for `AbortController`).

Files: pass `File`, `File[]`, `FileList` or `Blob`; the request becomes `multipart/form-data`. For `t.Files()` convert a
`FileList` with `Array.from`.

## Response handling

A call resolves to `{ data, error, response, status, headers }`.

- `data` is the 2xx body; `error` is `{ status, value }` for any status >= 300 (then `data` is `null`).
- **Check `error` before using `data`**; until then `data` is `T | null`. Switch on `error.status` to narrow `error.value` to
  the body type that status carries (from `status()` returns, `response` schemas, `HTTPError` classes and macro early returns).
- `redirect` responses are followed by `fetch`, so you usually see the destination.
- A generator or `sse()` response is an `AsyncGenerator`: `for await (const chunk of data)`.
- Utility types: `Treaty.Data<typeof api.user.post>` and `Treaty.Error<typeof api.user.post>`; also accept a resolved response.
- `throwHttpError: true` (config or per call) throws instead of returning `error`; use it only where a throw is wanted.

```ts
import { Elysia, t } from 'elysia'
import { treaty } from '@elysia/eden'

const app = new Elysia().post('/user', { body: t.Object({ name: t.String() }) }, ({ body: { name }, status }) => {
  if (name === 'Otto') return status(400, 'forbidden name')
  return name
})

const { data, error } = await treaty(app).user.post({ name: 'Ada' })
if (error) {
  if (error.status === 400) throw new Error(error.value)
  throw error.value
}
console.log(data.toUpperCase())
```

## Config

`treaty(urlOrInstance, options?)`. Options: `fetch` (default `RequestInit` except `headers`/`method`), `fetcher` (custom fetch-shaped
function returning a `Response`), `headers` (object, function `(path, init)` or array of functions; later wins; inline method headers
beat config), `onRequest`, `onResponse`, `parseDate`, `throwHttpError`.

- A bare host (`localhost:3000`) gets a protocol added: `http` for localhost or local addresses, otherwise `https`; same choice for `ws`/`wss`.
- Set auth headers once with `headers`, not per call.

## Eden plugins (new in 2.0 RC)

`createPlugin` / `PluginTypeFn` let a plugin add custom methods or observe calls with an explicit type. Reach for them only to extend
the client; ordinary apps do not need them.
