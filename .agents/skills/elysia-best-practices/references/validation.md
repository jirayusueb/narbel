# Elysia validation and the type system (digest)

Sources: https://next.elysiajs.com/essential/validation/ , https://next.elysiajs.com/patterns/typebox/ ,
the "Reference model" section of https://next.elysiajs.com/patterns/openapi/ , and the Elysia 1.4 post
https://next.elysiajs.com/blog/elysia-14/ (Standard Schema). Behaviour marked "(verified)" was run against
the installed `elysia@2.0.0-rc.1`.
Read this when writing a schema, choosing between `t` and zod, or debugging a 422.

## Schema slots

A route's hook object takes one schema per slot. All of them are checked before the handler runs; the
response is checked after.

| Slot | Checks | Notes |
| --- | --- | --- |
| `body` | parsed request body (JSON, form, files) | `t.File()` / `t.Files()` for uploads |
| `query` | query string | `t.Number()`, `t.Boolean()` coerce string input |
| `params` | path captures | same coercion as `query` |
| `headers` | request headers | extra headers are allowed unless `additionalProperties: false` |
| `cookie` | request cookies | `t.Cookie({...})`; see `patterns/cookie` |
| `response` | handler return | a schema, or a map `{ 200: ..., 404: ... }` keyed by status |

Schemas go in the second argument, before the handler: `.post(path, { body }, handler)`.

## Two schema libraries, one slot

- **`t`** is a named export of `elysia`, a wrapper around TypeBox 1.0 with HTTP extras
  (`t.Numeric`, `t.BooleanString`, `t.ObjectString`, `t.File`, `t.Files`, `t.Cookie`, `t.UnionEnum`,
  `t.Nullable`, `t.MaybeEmpty`, `t.Form`). One schema gives runtime check, coercion, TypeScript type and
  OpenAPI schema.
- **Standard Schema** libraries (zod, Valibot, ArkType, Effect Schema, Yup, Joi, compatible versions) can be
  used in any slot. They do not get Elysia's automatic coercion: use the library's own (`z.coerce.number()`).
  They do not get Elysia's file checks either; add `fileType()` in a refinement and `parse: 'formdata'`.
- Mixing is allowed per slot (`params` TypeBox, `body` zod). Pick one per project unless a dependency forces
  otherwise, so error messages and type-derivation habits (`UnwrapSchema` vs `z.infer`) stay consistent.

```ts
import { Elysia, t } from 'elysia'
import { z } from 'zod'

export const app = new Elysia()
  // TypeBox: "42" in the path becomes the number 42.
  .get('/box/:id', { params: t.Object({ id: t.Number() }) }, ({ params }) => params.id + 1)
  // zod: z.number() would reject "42"; coerce explicitly.
  .get('/zod/:id', { params: z.object({ id: z.coerce.number() }) }, ({ params }) => params.id + 1)
```

(verified: `query: z.object({ id: z.number() })` with `?id=1` returns 422; `z.coerce.number()` returns 200.)

## Coercion rules (TypeBox `t`)

- Elysia converts `t.Number()` and `t.Boolean()` at the **root and direct properties** of string-based
  request schemas (`params`, `query`, `headers`). A root numeric body converts too.
- A number inside a **JSON body object stays a number**: `{"id":"10"}` fails `t.Object({ id: t.Number() })`.
- A schema built outside a route (`const N = t.Number()`) gets no route conversion until a route uses it.
- Arrays in `query` need an array schema. `?name=a,b,c` (nuqs format) and `?name=a&name=b` (repeated key)
  both give `['a','b','c']` with `t.Array(t.String())`. Without the schema a comma list stays one string and a
  repeated key keeps its last value.
- Wrap a whole request schema in `t.Optional(...)` to allow omitting it.
- `t.Transform` is gone (TypeBox 1.0); use `t.Codec`. `t.Recursive`, `t.Not`, `t.RegExp` are no longer
  exported. Order for codec schemas is `Convert -> Check -> DecodeUnsafe`.

## Deriving TypeScript types

| Schema | Type |
| --- | --- |
| `t.*` | `UnwrapSchema<typeof S>` (the 1.x `typeof S.static` no longer exists on 2.0 types) |
| group of `t.*` schemas | `UnwrapModels<typeof Group>` maps each member |
| zod | `z.infer<typeof S>` |

```ts
import { t, type UnwrapModels, type UnwrapSchema } from 'elysia'

export const Create = {
  Body: t.Object({ title: t.String({ minLength: 1 }), tags: t.Array(t.String()) }),
}
export type Create = UnwrapModels<typeof Create>
export type Title = UnwrapSchema<typeof Create.Body>['title']

export function makeSlug({ title }: Create['Body']): string {
  return title.toLowerCase().replaceAll(' ', '-')
}
```

Never write `interface CreateBody` next to `t.Object`; the two drift. A class instance as a model is wrong
for the same reason (`instanceof` checks nothing at the boundary).

## Response schemas

- A `response` schema is optional, but it is the only thing that enforces a contract on what leaves the
  server, and the source of Eden's and OpenAPI's response types. Elysia also strips fields not in the schema.
- A status map ties each body type to its code. Return `status(404, body)` so the type relationship holds;
  assigning `set.status = 404` does not carry the type.
- A response that fails its own schema returns `500`, never `422` (the client did nothing wrong). In
  production that `500` carries no validation details.

## Guards

`.guard({...})` applies hooks and schemas to every route registered after it (or to the routes inside its
callback).

- Default is **override** in 2.0: a route's `body` replaces the guard's `body`; fields are not merged.
  (verified: a `.guard({ body: Name })` followed by `.post('/age', { body: Age }, ...)` accepts `{"age":3}`.)
- Add `schema: 'merge'` when both schemas must hold. Values are `'override' | 'merge'` in `types.d.ts`.
- A guard schema applies to every later route on the instance, including `GET`s: put read routes before it
  or inside separate instances.

## Reference models

`.model({ name: schema })` registers a named schema; routes then write `body: 'name'`. The point is OpenAPI
component names and editor completion, not sharing: a plain exported `const` already shares a schema between
files. Share registered models through a plugin (`new Elysia().model({...})`) and `.use()` it before the routes.

## Validation errors

Default body is an RFC 9457 problem document, status `422`, `application/problem+json`:
`{ type: 'validation', code, title, status, detail, on, property, ... }`.

- In development it also contains `found`, `expected` and `errors`. In `NODE_ENV=production` Elysia omits issue
  lists and submitted values, leaving `on` and `property` (verified).
- A body whose JSON exceeds 4 KB is not echoed back in `found`.
- `error: 'message'` on any schema field customises that field's message; a string is sent as plain text, and
  a custom message is not a problem document. `validationDetail('message')` keeps issue details alongside it.
- `allowUnsafeValidationDetails` re-enables details in production for public APIs; do not use it for private ones.
- In an `error` hook, `error instanceof ValidationError`, then read `error.all` (array of
  `{ path, message, schemaPath, params }`, dotted `path`) or `error.errors` (raw provider issues).
- File type checks (`t.File({ type: 'image/*' })`) need a registered detector:
  `setFileTypeDetector(fileTypeFromBlob)` from `file-type`. Without one every typed upload fails.
