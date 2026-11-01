---
name: typescript-best-practices
description: >-
  Write idiomatic, type-safe, maintainable TypeScript. Use this skill whenever you write,
  review, refactor, debug, or explain TypeScript or JavaScript code: modules, functions,
  types, interfaces, generics, error handling, async code, tsconfig.json, package.json
  exports, tests, or TSDoc. Trigger on any mention of TypeScript, .ts/.tsx/.mts/.cts files,
  tsc, tsgo, type errors, strict mode, any/unknown, generics, narrowing, zod or other
  schema validation, even when the user does not ask for "best practices". Synthesized
  from the Google TypeScript Style Guide, Effective TypeScript, the official TypeScript
  Handbook, and typescript-eslint. For React code also load react-best-practices; for
  Elysia servers also load elysia-best-practices.
---

# TypeScript best practices

Distilled from four TypeScript style and design sources, with a digest of each in
`references/`. Where they disagree, this file says which to follow and why. Targets
TypeScript 7 (where `strict` is on by default) and still applies to 5.x and 6.x.

## 1. Mindset

- **Types are erased; the runtime never sees them.** A type annotation is a claim, not a
  check. Every value that crosses a trust boundary (network, disk, `JSON.parse`, env vars,
  `localStorage`, user input, `postMessage`) is `unknown` until a runtime validator says
  otherwise. Inside the boundary, trust the types and stop re-checking.
- **Make invalid states unrepresentable.** Model variants as discriminated unions, not
  bags of optional fields and boolean flags. Brand IDs and units so they can't be mixed.
  Then the compiler enforces what a comment only requests.
- **Write TypeScript-shaped code.** Don't port Java or C# habits: no class per file by
  reflex, no `IFoo` interfaces with one implementation, no `Manager`/`Factory`/`Helper`
  types, no static-only classes. Modules are namespaces; functions and plain objects are
  the default unit of code.
- **Application code is not library code.** Library code (anything published or used
  across packages) gets explicit return types, stable exported types, and careful
  evolution. Application code favors directness: inferred locals, concrete types, no
  speculative generics.
- **Let the tools do the work.** The formatter owns layout, the linter owns idiom checks,
  `tsc` owns types. Spend your attention on design.

## 2. Before you hand back code

Run the project's own scripts first (`package.json` `scripts`, `turbo`, CI config). The
equivalents are:

```bash
tsc --noEmit            # or tsgo --noEmit, or the project's check-types script
<linter> check          # oxlint / biome / eslint, whichever the project uses
<test runner>           # bun test / vitest / node --test
```

- Fix the error rather than silencing it. When a suppression is genuinely right, use
  `// @ts-expect-error -- <reason>` on the narrowest line, never `// @ts-ignore`:
  `expect-error` fails once the error goes away, so stale suppressions get cleaned up.
  Linter suppressions name the rule and the reason.
- Never `// @ts-nocheck` a file you are editing. Never weaken `tsconfig.json` (turning off
  `strict`, adding `skipLibCheck` to hide your own errors) to make a change compile.
- If the project's tsconfig is loose, suggest `lints/tsconfig.strict.json` from the
  Beautiful TypeScript repository (where this skill lives): it adds
  `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`,
  `noImplicitReturns`, `noPropertyAccessFromIndexSignature`, `verbatimModuleSyntax`, and
  `erasableSyntaxOnly`. Turn flags on one at a time in an existing codebase.

## 3. Types: model the domain

### `unknown`, never `any`

`any` turns off checking for every value it touches and spreads silently through
assignments and returns. Use `unknown` for values you haven't validated and narrow them.
The few legitimate `any`s (a generic constraint like `(...args: any[]) => unknown`, an
untyped third-party escape hatch) stay local and never appear in an exported signature.

### No `as` to tell the compiler what you wish were true

`value as User` is a cast, not a conversion: it compiles and then fails at run time. In
order of preference, get the type by:

1. Annotation or inference: `const user: User = { ... }`.
2. `satisfies` to check a value without widening it: `const routes = {...} satisfies Routes`.
3. Narrowing: discriminant `switch` > `in` > `typeof`/`instanceof` > a type guard.
4. A runtime validator at the boundary (section 6).
5. `as` only after a check the compiler can't follow, with a comment saying which check.

Never `as unknown as T`. Never non-null-assert (`x!`) a value that can actually be
missing; handle the `undefined`. `as const` is not a cast and is fine.

### Discriminated unions instead of optional-field bags

```ts
type RequestState<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: T }
  | { status: "error"; error: Error };

export function describe(state: RequestState<string>): string {
  switch (state.status) {
    case "idle":
      return "Not started";
    case "loading":
      return "Loading";
    case "success":
      return state.data;
    case "error":
      return state.error.message;
    default:
      return state satisfies never;
  }
}
```

`state satisfies never` in the `default` arm makes adding a variant a compile error at
every `switch` that forgot it. Use it in every exhaustive `switch` over a union.

### Literal unions and `as const` objects, not `enum` or `namespace`

`enum` and `namespace` emit runtime code, can't run under Node's or Bun's type stripping,
and are rejected by `erasableSyntaxOnly`. Numeric enums also accept any number. Use a
union, plus a constant array when you need the runtime list:

```ts
export const ROLES = ["owner", "editor", "viewer"] as const;
export type Role = (typeof ROLES)[number];

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}
```

Where the sources disagree: the Google style guide still allows `enum`; this skill
follows the TypeScript team's direction (`erasableSyntaxOnly`, type stripping) and
bans it in new code. Don't rewrite existing enums unless asked.

### Brand values that must not be mixed

```ts
export type UserId = string & { readonly __brand: "UserId" };
export type BoardId = string & { readonly __brand: "BoardId" };

export function toUserId(raw: string): UserId {
  if (!raw.startsWith("usr_")) {
    throw new Error(`not a user id: ${raw}`);
  }
  return raw as UserId; // checked above
}
```

A `BoardId` now can't be passed where a `UserId` is expected. Validate once in the
constructor function; never brand without checking.

### Other modeling rules

- **`interface` for object shapes, `type` for everything else** (unions, function types,
  mapped and conditional types). Interfaces give better error messages and faster checks
  on `extends` than intersections. Be consistent with the file you're in.
- **No sentinels.** Absence is `undefined` (or `null` when an API already uses it), not
  `-1`, `""`, or `0`. Pick one of `undefined`/`null` per codebase; prefer `undefined`.
- **Optional means "may be absent".** With `exactOptionalPropertyTypes`, `x?: string`
  means the key may be missing; write `x?: string | undefined` only if callers really
  pass `undefined` explicitly.
- **`readonly` by default** on fields and parameters you don't mutate:
  `readonly items: readonly Item[]`. It documents intent and catches accidental writes.
- **Derive types, don't duplicate them:** `Pick`, `Omit`, `Partial`, `ReturnType`,
  `Parameters`, `Awaited`, `typeof`, `keyof`, indexed access (`Order["items"][number]`),
  and schema inference (`z.infer<typeof Schema>`). Two hand-written copies of a shape
  will drift.
- **Avoid the wrapper and catch-all types** `String`, `Number`, `Boolean`, `Object`,
  `Function`, and `{}`. Use `string`, `number`, `boolean`, `object`,
  `(...args: never[]) => unknown`, and `Record<string, unknown>` or a real shape.
- **`Map` and `Set` for dynamic keys.** Plain objects as dictionaries collide with
  `__proto__` and `toString`, and need `delete`. Use objects for records with known keys.
- **Use the strongest type the platform gives you:** `URL` not `string` for parsed URLs,
  `Date`/`Temporal` values not timestamps in strings, `Uint8Array` for bytes,
  `AbortSignal` for cancellation.

## 4. Functions and API design

### Naming

| Item | Case | Notes |
|---|---|---|
| Variables, functions, methods, properties | `lowerCamelCase` | Acronyms are one word: `userId`, `parseHtml` |
| Types, interfaces, classes, type parameters | `UpperCamelCase` | No `I` prefix, no `T` prefix on types |
| Module-level constants that never change | `CONSTANT_CASE` | Only true constants, not every `const` |
| Files | match the project (`kebab-case.ts` or `camelCase.ts`) | One convention per repo |

- Boolean names read as predicates: `isOpen`, `hasAccess`, `canEdit`.
- Name functions after what they return or do: `parseConfig`, `toUserId`, `loadBoard`.
  Avoid weasel words: `handleData`, `processItem`, `doStuff`, `utils.ts`, `helpers.ts`.
- Don't repeat the module in the name: `board.create`, not `board.createBoard` when
  callers import the module as a namespace.

### Signatures

- **Exported functions declare their return type.** It pins the contract, catches an
  accidental `undefined` branch, and speeds up checking. Libraries can enforce this with
  `isolatedDeclarations`. Local and private functions may infer. (Google and Effective
  TypeScript say not to annotate inferable types; that holds for locals, not for the
  exported contract.)
- **No boolean parameters in shared signatures.** `render(true, false)` is unreadable at
  the call site and can't grow a third mode. Use a string union or an options object.
- **More than two parameters, or any optional ones: take an options object.**

  ```ts
  interface ExportOptions {
    readonly format: "png" | "svg";
    readonly scale?: number;
    readonly background?: "transparent" | "white";
  }

  export function exportBoard(boardId: string, options: ExportOptions): string {
    const scale = options.scale ?? 1;
    const background = options.background ?? "white";
    return `${boardId}.${options.format}@${scale}x/${background}`;
  }
  ```

- **Accept the widest type you need, return the narrowest you have.** Take
  `readonly T[]` or `Iterable<T>` when you only read; return the concrete type.
- **Generics earn their place.** A type parameter must relate two or more things (an
  argument and the return, two arguments). `function f<T>(x: T): void` is just `unknown`
  with extra steps. Prefer one well-constrained parameter to several.
- **Unions over overloads** when the return type doesn't depend on the argument type.
  Use overloads only when it does, and order them most specific first.
- **Callbacks whose result is ignored return `void`**, not `any` or `unknown`.
- **Don't mutate arguments.** Return a new value, or name the function after the
  mutation (`sortInPlace`). Prefer `toSorted`, `toReversed`, `with`, and spread copies.

### Classes

Use a class when you have state with invariants that methods maintain, or when a
framework requires one (custom errors, Web Components). Otherwise use functions and
plain objects.

- Declare fields explicitly; don't use constructor parameter properties
  (`constructor(private db: Db)`): they're rejected by `erasableSyntaxOnly`.
- `readonly` fields by default. `private` is a compile-time check; use `#private` when the
  object is handed to code that must not reach inside at run time.
- Mark overrides with `override` (`noImplicitOverride`). Prefer composition to
  inheritance deeper than one level.
- Don't use static-only classes as namespaces; export functions from a module.

## 5. Errors

Pick the mechanism by contract:

| Situation | Use |
|---|---|
| Absence is normal (`find`, a cache miss) | return `undefined` |
| An expected failure the caller handles (validation, parse, "not found" in a domain op) | return a discriminated union, or throw a specific `Error` subclass the caller catches |
| A bug or violated invariant | `throw new Error("...")` with the values involved |

- **Throw only `Error` objects** (or subclasses). A thrown string has no stack trace.
- **Every message carries the values:** `` `unknown board ${boardId}` ``, not
  `"not found"`. Don't restate the condition as the message.
- **Wrap with `cause`** when rethrowing so the original stack survives:
  `throw new Error(`loading ${path}`, { cause: error })`.
- **`catch (error)` is `unknown`** (`useUnknownInCatchVariables` is part of `strict`).
  Narrow with `instanceof` before reading properties.
- **Never swallow.** An empty `catch`, or one that logs and continues, needs a comment
  saying why continuing is correct.
- **Don't catch to rethrow unchanged** and don't use exceptions for control flow.

```ts
export class ConfigError extends Error {
  override readonly name = "ConfigError";
  readonly path: string;

  constructor(path: string, message: string, options?: ErrorOptions) {
    super(`${path}: ${message}`, options);
    this.path = path;
  }
}

export function readPort(raw: string | undefined, path: string): number {
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new ConfigError(path, `expected a port number, got ${String(raw)}`);
  }
  return port;
}
```

Library code exports its error classes so callers can `instanceof` them, documents what
each function throws with `@throws`, and never throws for an outcome the caller is
expected to branch on every time; return a union for that:

```ts
export type ParseResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: string };

export function parseHexColor(input: string): ParseResult<number> {
  const match = /^#([0-9a-f]{6})$/i.exec(input);
  const digits = match?.[1];
  if (digits === undefined) {
    return { error: `not a #rrggbb color: ${input}`, ok: false };
  }
  return { ok: true, value: Number.parseInt(digits, 16) };
}
```

## 6. Boundaries and runtime validation

- **Parse, don't validate.** At the edge, turn `unknown` into a domain type once, with a
  schema library the project already uses (zod, valibot, TypeBox/Elysia `t`, arktype;
  any Standard Schema validator). Derive the static type from the schema so the two can't
  drift.
- `response.json()`, `JSON.parse`, `structuredClone` of foreign data, `process.env`, and
  `FormData` all return untyped values. Never `as` them into a type.
- Fail at the boundary with an error that names the source, not deep inside business
  logic with `undefined is not a function`.

```ts
import { z } from "zod";

const User = z.object({
  email: z.email(),
  id: z.string().min(1),
  name: z.string(),
});
export type User = z.infer<typeof User>;

export async function fetchUser(id: string): Promise<User> {
  const url = `/api/users/${encodeURIComponent(id)}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`GET ${url} failed with ${response.status}`);
  }
  return User.parse(await response.json());
}
```

Parse configuration and environment variables once at startup into a typed, frozen
object, and import that object everywhere else.

## 7. Everyday idioms

- `const` by default, `let` only when reassigned, never `var`.
- `??` for defaults, not `||`: `count || 10` replaces a real `0`. `?.` for optional
  access, but not as a way to ignore values that should exist.
- `for...of` over `.forEach` (it supports `break`, `continue`, `await`, and narrowing).
  `map`/`filter`/`reduce` for short, pure pipelines; a loop when the body does several
  jobs. Never spread an accumulator inside `reduce` (`{...acc, [k]: v}` is quadratic).
- Template literals over `+` concatenation. `Array.prototype.at(-1)` for the last element.
- `===` always, except `== null` when you deliberately mean `null` or `undefined`.
- Destructure parameters and results where it names things; don't destructure ten fields
  only to rebuild the object.
- **Named exports, not default exports.** Names stay consistent across imports and
  refactors work. Use `export default` only where a framework requires it.
- **No barrel files** (`index.ts` that re-exports a folder) inside an application: they
  defeat tree-shaking, slow tests and type checks, and create import cycles. A package's
  single public entry point is the exception.
- **`import type`** for type-only imports (`verbatimModuleSyntax` enforces it), so imports
  with side effects are explicit.
- **Magic numbers become named constants** with a comment saying where the value comes
  from: `const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // matches the S3 bucket policy`.
- **No `console.log` in shipped code.** Use the project's logger with structured fields;
  a CLI's own stdout output is the exception.
- Regular expressions used in loops or hot functions live in module-level constants.

## 8. Async

- **Every promise is awaited, returned, or explicitly handled.** A floating promise loses
  its rejection. For deliberate fire-and-forget, write `void task().catch(report)`.
- **Run independent work concurrently:** `await Promise.all([loadUser(id), loadOrders(id)])`,
  not two sequential `await`s. Use `Promise.allSettled` when partial failure is acceptable.
- **No `async` callbacks in `forEach`, `filter`, or `some`**; they don't wait. Use
  `for...of` with `await` (sequential) or `Promise.all(items.map(...))` (concurrent),
  with a concurrency limit for large inputs.
- **Never pass an `async` function to `new Promise`.** Throws inside it are lost.
- **Cancellation and timeouts use `AbortSignal`:** accept `signal?: AbortSignal` in
  long-running functions, pass it to `fetch`, and use `AbortSignal.timeout(ms)` and
  `AbortSignal.any([...])` rather than racing `setTimeout` by hand.
- **Clean up with `using` / `await using`** (explicit resource management) where the
  runtime supports `Symbol.dispose`; otherwise `try`/`finally`.
- Don't `return await` except inside `try` (where it's needed to catch the rejection).

## 9. Modules, packages, configuration

- ESM only for new code: `"type": "module"`, `import`/`export`, no `require`.
- `tsconfig.json`: `strict` (default on in TS 7), `moduleResolution` `bundler` for apps
  built by a bundler and `nodenext` for code Node runs or publishes, `verbatimModuleSyntax`,
  `noUncheckedIndexedAccess`. Don't use `baseUrl` or `paths` aliases where package
  `imports` (`"#lib/*"`) or workspace packages work.
- Libraries declare `exports` in `package.json` with a `types` condition, ship `.d.ts`
  files, and don't leak dependency types they don't re-export.
- Every dependency costs install time, bundle size, and supply-chain exposure. Check
  whether the platform (`fetch`, `structuredClone`, `crypto.randomUUID`, `Intl`,
  `URLPattern`) or an existing dependency already does the job. Commit the lockfile.
- Keep dependency direction one way: domain code doesn't import from UI or HTTP layers.
  No import cycles.

## 10. Documentation and comments

- `/** TSDoc */` on exported items: a one-line summary first, then what the signature
  can't say (units, preconditions, side effects, what it throws, complexity).
- Don't repeat types in JSDoc (`@param {string} id`); TypeScript already has them.
- Use `@throws`, `@example`, `@deprecated` (with the replacement), and `{@link Other}`.
- `//` comments explain why: workarounds with a link, non-obvious constants,
  `// TODO(#123):`. Don't narrate the code or keep design history in comments.

## 11. Tests

- Test observable behavior through the public API, not private functions or call order.
- Prefer real collaborators (an in-memory database, a real `Request`, a temp directory)
  to mocks; mock only what you can't run (third-party APIs, the clock, randomness).
- Inject time and randomness (`now: () => Date`) instead of patching globals.
- Build fixtures with typed builders or `satisfies`, never `as Foo` on a partial object.
- Test types that are part of a public contract with `expectTypeOf` (Vitest) or
  `// @ts-expect-error` lines that must keep failing.
- Write the failing test before fixing a bug.

## 12. Refactoring someone else's code

- Fix every smell the request is about, not just the cheap ones: `any`, `as` casts,
  non-null assertions, boolean parameters, `enum`, floating promises, `||` defaults,
  unvalidated `JSON.parse` / `response.json()`, swallowed errors, default exports,
  mutation of arguments, duplicated type definitions.
- Keep public behavior identical unless changing it is the point: same exports, same
  thrown errors, same output. If a signature must change, show before and after and say
  why.
- Preserve quirks you don't understand and flag them rather than silently "fixing" them.
- When the module has no tests, pin current behavior with a few before you touch it.

## 13. Performance, in order

Measure first. Then: pick the right data structure (`Set`/`Map` lookups over
`array.includes` in loops); avoid quadratic copies (spread in `reduce`, `concat` in a
loop); batch I/O and run independent awaits concurrently; stream large payloads instead
of buffering. For type-check speed: `interface extends` over large intersections, avoid
deeply recursive conditional types, and annotate exported return types.

## 14. Final checklist

Before returning TypeScript, confirm:

- Type check, lint, and tests are clean, with no new suppressions lacking a reason.
- No `any` in exported signatures, no `as` without a preceding check, no `!` on values
  that can be missing.
- Every value from outside the process is validated before use.
- Every `switch` over a union is exhaustive with `satisfies never`.
- No `enum`, `namespace`, or constructor parameter properties in new code.
- Every promise is awaited, returned, or explicitly handled; independent awaits run
  concurrently.
- Errors are `Error` objects with the relevant values and a `cause` when wrapping.
- Exported functions have return types and TSDoc; no boolean parameters.
- Application code stayed simple; library code followed the API rules.

## References

Read these when you need the reasoning behind a rule. Each is a condensed digest of one
source.

- `references/google-typescript-style-guide.md`
  (https://google.github.io/styleguide/tsguide.html): naming, imports and exports,
  classes, type system usage, comments.
- `references/effective-typescript.md` (https://effectivetypescript.com): choosing
  between alternatives: type design, `any` containment, inference, generics, migration.
- `references/typescript-handbook.md` (https://www.typescriptlang.org/docs/handbook/):
  official Do's and Don'ts, narrowing, generics, declaration files, TS 6/7 config changes.
- `references/typescript-eslint.md` (https://typescript-eslint.io/rules/): the
  type-aware lint rules worth enabling and their oxlint equivalents.
- React code: the `react-best-practices` skill. Elysia servers: the
  `elysia-best-practices` skill.
