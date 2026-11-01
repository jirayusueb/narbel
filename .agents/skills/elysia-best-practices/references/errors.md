# Elysia error handling (digest)

Sources: https://next.elysiajs.com/patterns/error-handling/ , https://next.elysiajs.com/essential/life-cycle/#error-error-handling ,
https://next.elysiajs.com/essential/handler/#status , the beta post https://next.elysiajs.com/blog/elysia-20/ ("Error Handling",
"Problem Error"), and the installed `elysia@2.0.0-rc.1`. "(verified)" means run against that install.
Read this when returning an expected failure, mapping a library error, or deciding what a client sees on a 500.

## Return, do not throw

- **Return** an expected failure so TypeScript can see it: `status(404, ...)`, `problem(...)`, or an `HTTPError`
  instance. The return type becomes part of the route's response type, which Eden and OpenAPI generation read.
  A thrown error is invisible to the type system and shows as `unknown`.
- At runtime a returned `Error` goes through `onError` exactly like a thrown one. `status()` and `problem()` are
  different: returning them sends an ordinary response and skips error handling; **throwing** them enters it.
- Use `status()` for a one-off in a handler. Use an `HTTPError` subclass when the same failure comes from several
  places or a client needs a stable identifier.

```ts
import { Elysia, HTTPError, t } from 'elysia'

class UserNotFound extends HTTPError.id('USER_NOT_FOUND', 404) {
  readonly userId: string
  constructor(userId: string) {
    super()
    this.userId = userId
  }
  override detail = 'No such user'
}

function findUser(id: string) {
  return id === '1' ? { id, name: 'ada' } : new UserNotFound(id)
}

export const app = new Elysia().get('/users/:id', { params: t.Object({ id: t.String() }) }, ({ params }) =>
  findUser(params.id)
)
```

(verified: `/u/2` responds `404`, `application/problem+json`,
`{"type":"USER_NOT_FOUND","code":"USER_NOT_FOUND","detail":"nope","status":404,"title":"Not Found"}`.)

## status() and problem()

| Call | Result |
| --- | --- |
| `status(code, body)` | exact status and body; the code and body type travel together (`status('Conflict', ...)` also works) |
| `problem(code, { detail, type, ... })` | RFC 9457 document, `application/problem+json`; Elysia fills `type` and `title` |
| `set.status = n` | sets a default status only; loses the status-to-body type link |

In 2.0 `status` is also a named export (`import { status } from 'elysia'`) for use in services. `error()` is gone (deprecated in 1.3 for `status`).

## HTTPError

`class X extends HTTPError.id('CODE', 409) {}` makes a class Elysia can turn into a response with no `onError`.

| Member | Effect |
| --- | --- |
| `headers` | added to the response |
| `detail` | the problem document's `detail`; beats the message, so the message can stay in logs |
| `extension()` | extra members in the problem document; plain object, synchronous; typed into the route |
| `value()` | replaces the whole body; may be `async`; if it returns `undefined`, falls through to `detail`/`extension()` |

- `type` and `status` must be `readonly` or `as const` for the type system to read them. A hand-written class
  `extends Error implements HTTPError` also works; any `Error` with a `status` property is sent at that status as plain text.
- `HTTPError.id` adds a `code` member and the `HTTPError.typeBase` prefix; a hand-written class does not.
  Set `HTTPError.typeBase = 'https://example.com/errors'` once to make `type` an absolute URL; `code` stays bare.
- If `value()` or `extension()` throws, the response is `500` without the error's headers.

## onError

```ts
import { Elysia, NotFound, ValidationError, problem } from 'elysia'

export const app = new Elysia()
  .onError(NotFound, () => problem(404, { detail: 'Route not found' }))
  .onError(ValidationError, ({ status }) => status(400, 'Invalid request'))
  .get('/ok', () => 'ok')
```

- `.onError(ErrorClass, handler)` maps a class; `.onError(fn)` is the catch-all, where you narrow with `instanceof`.
  The `code` string is gone: `onError(({ code }) => ...)` is a type error. A handler (or value) is accepted:
  `.onError(DrizzleQueryError, problem(502, { detail: 'Database unavailable' }))`.
- Returning a value sends it. Returning nothing passes the error to the next hook, then to Elysia's default.
  Returning an `Error` sends it as if unhandled, at its own status; it is not passed to other hooks.
- Per-route: the `error` key of the hook object. Same for scope: `.onError('plugin', fn)`.
- `onError` is a hook like any other: it only covers routes registered **after** it (verified: an `onError(ValidationError)`
  placed after the routes did not change their 422). Put it first.
- Map library errors you do not control (ORM, SDK) with `.onError(LibError, ...)`; to type the mapped response
  into the route, `return` the caught error from a `try/catch` in the handler.

## Built-in errors

| Class | Status | `code` | When |
| --- | --- | --- | --- |
| `NotFound` | 404 | `not-found` | no route matches (`NotFoundError` in 1.x) |
| `ParseError` | 400 | `parse` | body cannot be parsed |
| `ValidationError` | 422 | `validation` | request fails schema |
| `InvalidCookie` | 400 | `invalid-cookie` | signed cookie fails (500 if the secret is missing) |
| `InternalServerError` | 500 | `internal-server-error` | you throw it |

You may throw `NotFound` and `InternalServerError` yourself; a message you pass is sent as `detail`, even in production.

## What the client sees

- Every Elysia error is an RFC 9457 problem document with `application/problem+json` (1.x sent bare strings).
  Non-Eden clients that assumed a plain-text body need updating.
- An unhandled error with no `status` becomes `500` with `detail` and `name` set to the error's message and class in
  development. With `NODE_ENV=production` those are omitted (verified: body is only `type`, `code`, `title`, `status`).
  A generic `Error` or any `ElysiaError` with status >= 500 and no explicit `response` now answers `Internal Server Error`.
- Validation: production responses keep only `on` and `property`. A custom `error` message is sent as written.
- A response that fails its own `response` schema is a `500`, not a `422`.

## Typed errors in Eden

```ts
import { Elysia, HTTPError } from 'elysia'
import { treaty } from '@elysia/eden'

class OutOfCredit extends HTTPError.id('OUT_OF_CREDIT', 402) {}

const app = new Elysia().get('/credit', () => new OutOfCredit('Top up'))
const { error } = await treaty(app).credit.get()

if (error?.status === 402) console.log(error.value.code)
```

A returned error is typed under its status; `error.status` narrows `error.value` just like a `status()` response.
