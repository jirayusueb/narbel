---
name: typescript-review
description: >-
  Review existing TypeScript code, including React components and Elysia servers, for
  type safety, correctness, error handling, API design, and maintainability, and produce a
  prioritized report where every finding cites the rule it breaks and gives a concrete
  fix. Use this whenever the user asks to review, audit, critique, grade, or "check"
  TypeScript, JavaScript, React, or Elysia code: a .ts/.tsx file, a package, a component,
  a route, a diff, or a pull request, or asks what is wrong with their code or how to make
  it more type-safe or idiomatic, even if they don't say "review". Pairs with the
  typescript-best-practices, react-best-practices, and elysia-best-practices skills, which
  cover writing new code.
---

# TypeScript review

Review TypeScript against the same rules the `typescript-best-practices` skill uses for
writing it (plus `react-best-practices` for React and `elysia-best-practices` for Elysia),
and report what to change. The output is a review, not a rewrite: the reader decides what
to fix. Only rewrite code when the user asks for that.

## 1. Decide the scope

- **What to read.** Review exactly what the user pointed at: a file, a folder, a package,
  or a diff. For a diff, review the changed lines and anything they break, not the whole
  file.
- **Library or application.** A package with `exports` in `package.json`, published to a
  registry or imported by other workspace packages, is held to the API rules strictly
  (explicit return types, exported error classes, stable types). Application code gets
  the simplicity rules instead. Say which you assumed at the top of the report.
- **The toolchain**, from `package.json` and `tsconfig.json`: TypeScript version, `strict`
  and the extra strict flags, module resolution, runtime (Node, Bun, Deno, browser), and
  the linter. Don't recommend features the project can't use.
- **Frameworks.** If the code imports `react`, read the `react-best-practices` skill
  first. If it imports `elysia`, read `elysia-best-practices` first. Each lists the
  framework conventions to leave alone and the framework bugs to look for.

## 2. Run the tools first, if you can

Run the project's own scripts (`check-types`, `lint`, `test`) or the equivalents, and
fold the results into the report:

```bash
tsc --noEmit
<linter> check
<test runner>
```

Don't paste raw output. Group repeated errors into one finding and skip noise that
doesn't matter for this code. If the tools can't run, say so in the report and review by
reading.

## 3. What to look for, in priority order

Work through these in order. The first two categories are where real bugs live.

**Correctness**

- Unvalidated input: `JSON.parse`, `response.json()`, `request.body`, `process.env`,
  `FormData`, `localStorage`, or `postMessage` data used as a typed value without a
  runtime check; `as` casts on any of them.
- Casts that lie: `as T`, `as unknown as T`, non-null `!` on values that can be missing,
  type guards that don't check what their name claims.
- Async bugs: floating promises, `async` callbacks in `forEach`/`filter`, `async`
  `Promise` executors, sequential `await`s on independent work in a hot path, missing
  cancellation, races between overlapping requests.
- Non-exhaustive `switch` or `if` chains over unions, with no `satisfies never` arm.
- `||` defaults that discard `0`, `""`, or `false`; `==` comparisons; index access that
  assumes the element exists (`arr[0].x`) without `noUncheckedIndexedAccess`.
- Mutation of arguments, shared module state, or React props and state.
- React: effects used to derive state, missing effect cleanup, stale closures, hooks
  called conditionally, unstable `key`s, components defined inside components.
- Elysia: unvalidated `body`/`query`/`params`, broken method chains that lose types,
  hooks with the wrong scope, auth checks that a route can skip, internals leaked in
  error responses.

**Error handling**

- Thrown strings or plain objects; `catch` blocks that read properties of `unknown`
  without narrowing; empty or log-and-continue `catch` blocks with no reason given.
- Errors that lose information: rethrown without `cause`, messages without the value or
  ID that failed, generic `"something went wrong"`.
- Exceptions used for an outcome every caller must branch on, where a returned union
  would make the branch visible.

**Type and API design** (strict for libraries)

- `any` in exported signatures or spreading through a module; `Function`, `Object`, `{}`,
  or wrapper types (`String`).
- Optional-field bags and boolean flags where a discriminated union fits; unbranded IDs
  that get mixed up; sentinels (`-1`, `""`) for absence.
- `enum`, `namespace`, constructor parameter properties in code meant to run under type
  stripping or `erasableSyntaxOnly`.
- Duplicated type definitions that should be derived (`Pick`, `z.infer`, `ReturnType`).
- Boolean parameters or more than two positional parameters in shared functions;
  generics that relate nothing; overloads where a union works.
- Exported functions without return types (libraries); dependency types leaking into a
  package's public API.

**Idiom and clarity**

- Default exports, barrel files inside an app, import cycles, value imports used only as
  types.
- Hand loops that are clearer as `map`/`filter`, or pipelines long enough to need a loop;
  spread inside `reduce`.
- Magic numbers, weasel names (`data`, `handle`, `utils`), `console.log` left in.
- `@ts-ignore`, `@ts-nocheck`, or lint suppressions without a reason.

**Documentation and tests**

- Exported items without TSDoc, or TSDoc that restates the name or the types.
- Logic with no tests; tests that assert on mocks, implementation details, or restated
  constants; fixtures built with `as`.

The `typescript-best-practices` skill and its `references/` folder hold the full rules and
their reasoning. If it is installed, read the relevant reference when a finding needs a
rule you're unsure of. Otherwise, rely on the summary above.

## 4. Write the report

Use this structure:

~~~markdown
# TypeScript review: <what was reviewed>

<One paragraph: what the code does, library or application, overall verdict, and the
single most important thing to fix. Say whether the type checker, linter, and tests
were run.>

## Must fix
### 1. <Short title> (`src/file.ts:42`)
**Rule:** <rule and source, e.g. "Validate data at trust boundaries (Effective
TypeScript, item on unknown)" or "no-floating-promises (typescript-eslint)">
**Problem:** <what is wrong and the concrete consequence, one or two sentences>
**Fix:**
```ts
<the smallest code change that fixes it>
```

## Should fix
### 2. ...

## Consider
### 3. ...

## What's already good
- <2 to 4 specific things the code does well>
~~~

How to sort findings:

- **Must fix** means a bug, a type hole that lets bad data through, a reachable crash, a
  security issue, or an API mistake that becomes a breaking change once published.
- **Should fix** means it works but violates a rule with a real cost, such as worse error
  messages, harder testing, or a confusing API.
- **Consider** means style, naming, and polish.

Rules for each finding:

- **Cite a location** as `file:line` for every finding (write `whole file` when there is
  no single location), and cite the rule with its source: a typescript-eslint or oxlint
  rule name, an Effective TypeScript item, a Google TypeScript Style Guide section, a
  TypeScript Handbook page, or a react.dev / elysiajs.com page. A reader should be able to
  look the rule up.
- **Show the fix as code**, kept to the lines that change. Don't rewrite whole functions.
- **Group repeats.** One finding for "six `as User` casts on API responses", listing the
  lines, rather than six findings.
- **Respect intent.** If something looks deliberate (a documented quirk, a comment
  explaining it), mention it under Consider with the trade-off. Don't mark it Must fix.
- **Keep it proportionate.** For a short file, five to ten findings is plenty. Don't pad
  the list, and don't hide a real bug among style nits.
- **"What's already good" is required.** It tells the author what to keep and makes the
  rest credible.

## 5. Offer the strict config

If the project's `tsconfig.json` lacks the extra strict flags, end the report by
suggesting `lints/tsconfig.strict.json` from the Beautiful TypeScript repository, enabled
one flag at a time. Name two or three findings from this review that it would have caught
(for example, `noUncheckedIndexedAccess` catching `rows[0].id`).
