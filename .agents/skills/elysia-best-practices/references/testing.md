# Testing Elysia apps (digest)

Sources: https://next.elysiajs.com/patterns/unit-test/ , https://next.elysiajs.com/eden/treaty/unit-test/ ,
https://next.elysiajs.com/essential/best-practice/#testing , https://next.elysiajs.com/essential/plugin/#testing , and the
installed `elysia@2.0.0-rc.1` (`handle` is declared as `(url: string | Request, options?: RequestInit) => Promise<Response>`).
"(verified)" means run with `bun` against that install.
Read this when writing a route test, a service test, or a type-level test of the client.

## Shape of a test suite

- Export the app from `src/app.ts` and call `.listen()` only in `src/index.ts`, so tests import the app without a port.
- Test **business rules through services** (plain functions, no HTTP). Test **HTTP behaviour** (status, headers, validation,
  auth) through `app.handle`. Test **client types** through `treaty(app)`.
- One test file per feature: `test/user.test.ts`.
- Runner: `bun test` with `import { describe, expect, it } from 'bun:test'`. Jest also works.

## app.handle

`handle` takes a Web Standard `Request` (or, in 2.0, a URL string plus an optional `RequestInit`) and resolves a `Response`.
No port is opened.

```ts
import { describe, expect, it } from 'bun:test'
import { Elysia, t } from 'elysia'

const app = new Elysia()
  .get('/', () => 'hi')
  .post('/sum', { body: t.Object({ a: t.Number(), b: t.Number() }) }, ({ body }) => ({ total: body.a + body.b }))

describe('app', () => {
  it('returns text', async () => {
    const res = await app.handle(new Request('http://localhost/'))
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('hi')
  })

  it('validates the body', async () => {
    const res = await app.handle('http://localhost/sum', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ a: 1, b: 'x' }),
    })
    expect(res.status).toBe(422)
    expect(res.headers.get('content-type')).toContain('application/problem+json')
  })
})
```

- Pass an **absolute** URL (`http://localhost/...`); the docs say a relative path such as `/user` is not enough.
- Set `content-type: application/json` yourself when sending a JSON string body.
- Hooks, validation and error mapping all run, as in a real request. Assert on `status`, `content-type` and the body, not on internals.
- `app.handle` does not wait for lazy or async plugins: `await app.modules` first (`.listen()` and `app.fetch` do wait).
- `context.server` is `null` for a direct `handle`, so code reading `server?.requestIP(request)` gets `undefined`.
- Build the **same composed app** the server uses. Testing a feature instance alone skips hooks that the parent registers.

## Eden treaty in tests

`treaty(app)` calls `app.handle` in-process and gives typed requests and responses.

```ts
import { describe, expect, it } from 'bun:test'
import { Elysia, t } from 'elysia'
import { treaty } from '@elysia/eden'

const app = new Elysia()
  .get('/hello', () => 'hi')
  .get('/users/:id', { params: t.Object({ id: t.String() }) }, ({ params, status }) =>
    params.id === '1' ? { id: '1', name: 'ada' } : status(404, 'missing')
  )

const api = treaty(app)

describe('users', () => {
  it('greets', async () => {
    const { data, error } = await api.hello.get()
    expect(error).toBeNull()
    expect(data).toBe('hi')
  })

  it('narrows the error by status', async () => {
    const { data, error } = await api.users({ id: '2' }).get()
    expect(data).toBeNull()
    expect(error?.status).toBe(404)
    expect(error?.value).toBe('missing')
  })
})
```

- Use treaty when the test should also fail to **compile** if the route's contract changes. Include `test/` in `tsconfig.json` and run
  `tsc --noEmit` (or `bun run typecheck`) alongside `bun test`; that is the type-level test.
- Use `handle` when you must assert on raw headers, status text, streaming bodies or malformed requests that treaty cannot form.
- Never pre-encode path params in treaty calls (see `eden.md`).

## Testing hooks, auth and errors

- **Auth macro**: request without the credential, expect `401`; with it, expect the handler's value.
- **Error mapping**: assert the status and `type`/`code` of the problem document, not the English `detail`.
- **Production shape**: `NODE_ENV=production bun test path` to check that 500s and 422s carry no `detail`, `found`, `errors`. Set the
  variable in the command, not inside the test.
- **Scope**: test a plugin through a parent app, because hooks local to the plugin are invisible from outside it.
- **Dedup**: count hook invocations with a counter in `onRequest`; a named plugin used by two routers should count once per request.

## Service tests

A service function takes explicit inputs and returns values or `status()`/`HTTPError` results, so it needs no app.

```ts
import { describe, expect, it } from 'bun:test'
import { HTTPError } from 'elysia'

class NotEnoughStock extends HTTPError.id('NOT_ENOUGH_STOCK', 409) {}

function reserve(stock: number, wanted: number) {
  if (wanted > stock) return new NotEnoughStock('Only ' + stock + ' left')
  return { reserved: wanted, left: stock - wanted }
}

describe('reserve', () => {
  it('rejects over-reservation', () => {
    expect(reserve(1, 2)).toBeInstanceOf(NotEnoughStock)
  })
  it('reserves', () => {
    expect(reserve(5, 2)).toEqual({ reserved: 2, left: 3 })
  })
})
```

Returning the error (not throwing) makes the failing path a plain `toBeInstanceOf` assertion, with no `try/catch` in the test.
