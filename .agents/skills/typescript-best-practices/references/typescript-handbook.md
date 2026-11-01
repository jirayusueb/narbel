# TypeScript Handbook and 6.0/7.0 changes (digest)

Source: the official TypeScript Handbook, https://www.typescriptlang.org/docs/handbook/ ,
plus the TypeScript 6.0 and 7.0 announcements and the option defaults printed by
`tsc --help --all` for the TypeScript 7.0.2 installed in this repo. The handbook is
the normative description of language behavior (narrowing, generics, declaration
files); the release posts are the normative record of what changed in the compiler.
Consult this file for "what does the compiler actually do", for tsconfig decisions,
and for the final word when Google or Effective TypeScript is silent or stale. Where
the handbook and the style guides differ, the **Disagrees** lines say so.

## 1. Do's and Don'ts (handbook, "Declaration Files > Do's and Don'ts")

Written for `.d.ts` authors but sound for any API surface.

1. **Never use `Number`, `String`, `Boolean`, `Symbol`, `Object`.** They are boxed
   wrapper types; use `number`, `string`, `boolean`, `symbol`, and `object`.
2. **Never write a generic whose type parameter is unused.** It makes inference
   meaningless; the handbook links the FAQ ("why doesn't type inference work on this
   interface").
3. **Never use `any` except while migrating JS.** It is like `@ts-ignore` on every use.
   Use `unknown` when you do not know the type or just pass it through.
4. **A callback whose return value is ignored returns `void`, not `any`.** `void`
   stops you from using the result unchecked.
5. **Callback parameters are not optional.** A callback may always accept fewer
   arguments; `elapsed?: number` wrongly says it might be called with one.
6. **Do not write overloads that differ only in callback arity.** One overload with
   the maximum arity covers the shorter callbacks.
7. **Order overloads specific first, general last.** TypeScript picks the first
   matching overload, so a general one first hides the rest.
8. **Use optional parameters rather than overloads that differ in trailing
   parameters** (when the return type is the same). It also behaves correctly under
   `strictNullChecks`.
9. **Use a union type rather than overloads that differ by type in one position.**
   A union accepts `string | number`; overloads reject an argument that is the union.

## 2. Narrowing (handbook, "Narrowing")

TypeScript narrows a union by tracking control flow. Know the forms; reach for the
first one that works.

| Form | Narrows | Notes |
| --- | --- | --- |
| `typeof x === "string"` | primitives | `typeof null` is `"object"`; check null separately |
| truthiness `if (x)` | removes `null`/`undefined`, also `0`, `""`, `NaN` | do not use for `number | undefined` if 0 is valid |
| `x === y`, `x !== undefined` | equality narrows both sides | `== null` covers null and undefined |
| `"k" in obj` | by property presence | works on unions of object types |
| `x instanceof C` | to class `C` | does not work across realms |
| `Array.isArray(x)` | arrays | |
| discriminant `s.kind === "a"` | discriminated union | the preferred shape for domain data |
| user-defined guard `(x): x is T` | to `T` | the function body is not checked; a wrong guard lies |
| assertion function `asserts x is T` | to `T` after the call | for validators that throw |
| assignment | to the assigned type | a `let` declared as a union narrows on assignment |

10. **Model variants as a discriminated union with a literal `kind`/`type` field**, so a
    `switch` narrows each branch and adding a member becomes a compile error.
11. **End exhaustive `switch` statements with a `never` check**
    (`const _exhaustive: never = x`) so a new union member fails the build.
12. **Do not use a type predicate that only returns `boolean` to narrow.** Write
    `x is T` and test it. (TypeScript 5.5 infers predicates for simple filters like
    `.filter(x => x !== undefined)`.)
13. **Narrowing does not survive callbacks or mutation of the variable.** Copy to a
    `const`, or narrow inside the callback.

## 3. Generics (handbook, "Generics" and "More on Functions")

14. **Add a type parameter only when it relates two or more positions** (input to
    output, or two inputs). If it appears once, use the concrete type. This is the
    handbook's "use fewer type parameters" and "type parameters should appear twice"
    guideline, and Effective TypeScript Item 51.
15. **Push type parameters down and use the parameter itself rather than
    constraining it.** `<Type>(arr: Type[]): Type` infers a better return type than
    `<Type extends any[]>(arr: Type)`, and a constrained parameter that is returned
    as its constraint loses the caller's specific type.
16. **Constrain with `extends`, and let inference supply the argument.** Specify type
    arguments by hand only when inference fails or to widen.
17. **Prefer `keyof` constraints for property access**
    (`<T, K extends keyof T>(o: T, k: K): T[K]`) over `string`.
18. **Give a generic default (`<T = string>`) only when a no-argument use is real.**
19. **If a call needs `<Foo>` written out every time, redesign the signature.**
    Inference that falls back to `unknown` or the constraint means the type parameter
    has nothing to relate.
20. **Reach for conditional, mapped, and template-literal types only after generics
    plus a built-in utility (`Partial`, `Pick`, `Omit`, `Record`, `ReturnType`,
    `Awaited`, `NoInfer`, `Extract`, `Exclude`) fail.** Explain them with a test.

## 4. Declaration files (handbook, "Declaration Files")

21. **Distribute types alongside JS: `"types"` in `package.json` pointing at the root
    `.d.ts`, or colocated `index.d.ts`.** With `exports`, put the `types` condition
    first in each entry.
22. **Emit `.d.ts` with `declaration: true` for libraries**; with
    `isolatedDeclarations` a single-file transpiler can emit them (see section 6).
23. **A `.d.ts` has only types and `declare`d values; no implementations.**
    Use `declare function`, `declare const`, `declare module "x"`, `declare global`.
24. **Identify the module shape first.** ES module (`export`) or global script;
    CommonJS `export =` needs `esModuleInterop`/`allowSyntheticDefaultImports`
    to be imported as default. (Both are always on in 6.0/7.0, see section 6.)
25. **Do not publish types that reference `@types/*` unless you list the package in
    `dependencies`.** Mirror the few types you need instead (Effective TypeScript 70).
26. **Add `@types/x` as a devDependency for untyped JS packages** (DefinitelyTyped).
    Module augmentation (`declare module "x" { ... }`) fixes gaps without forking.
27. **Do not put `/// <reference>` directives in `.ts` source.** Use imports and
    `compilerOptions.types`.

## 5. Everyday types worth restating

28. **`interface` and `type` alias are interchangeable for object shapes; use
    `interface` until you need a union, tuple, mapped type, or primitive alias.**
    Handbook: "If you would like a heuristic, use `interface` until you need to use
    features from `type`." **Disagrees:** none with Google (`interface`); Effective
    TypeScript Item 13 is neutral if consistent.
29. **Annotate function parameters, not locals.** Inference handles the rest; return
    annotations are optional unless `isolatedDeclarations` is on.
30. **Use `unknown`, not `any`, for caught errors** (`useUnknownInCatchVariables` is
    part of `strict`) and for untrusted input; narrow before use.
31. **Enums are a TypeScript-only construct with runtime output.** The handbook says
    "In modern TypeScript, you may not need an enum when an object with `as const`
    could suffice". **Disagrees:** Google allows plain `enum`; `erasableSyntaxOnly`
    forbids all of them. Use an `as const` object plus a derived union.

## 6. TypeScript 6.0 and 7.0: what changes how code and tsconfig are written

Verified against the 6.0 post (https://devblogs.microsoft.com/typescript/announcing-typescript-6-0/),
the 7.0 beta post
(https://devblogs.microsoft.com/typescript/announcing-typescript-7-0-beta/), the
5.8 release notes, and `bunx tsc --help --all` on 7.0.2 in this repo.

**Release shape.** 6.0 (March 2026) is the last JavaScript-based compiler, a bridge
release that deprecates what 7.0 removes. 7.0 is the Go port, "often about 10 times
faster", with type-checking logic structurally identical to 6.0. The installed
`typescript` 7.0.2 provides the `tsc` binary. Parallelism flags: `--checkers`
(default 4), `--builders`, `--singleThreaded`. `stableTypeOrdering` is always on, so
declaration emit unions have a deterministic order. Tools that import the TS API
(typescript-eslint) need `typescript@npm:@typescript/typescript6` until the stable
programmatic API arrives in 7.1 or later (per the 7.0 beta post).

**New defaults** (6.0 and 7.0; confirmed against 7.0.2 `--help --all` unless noted):

| Option | Now | Effect on you |
| --- | --- | --- |
| `strict` | `true` (confirmed) | Setting `"strict": true` is redundant; set `false` only to opt out. |
| `target` | `es2025` (confirmed; the lowest allowed is `es2015`) | No downleveling; write modern syntax. |
| `module` | `esnext` per the posts; `--help` prints no default | Set `module` explicitly (`preserve` for bundlers/Bun, `nodenext` for Node). |
| `moduleResolution` | `bundler` unless `module` is `node16`/`node18`/`nodenext` (confirmed) | Only `node16`, `nodenext`, `bundler` remain. |
| `noUncheckedSideEffectImports` | `true` (confirmed) | `import "./x.css"` must resolve or errors. |
| `libReplacement` | `false` (confirmed) | No `@typescript/lib-*` replacement lookup. |
| `esModuleInterop`, `allowSyntheticDefaultImports` | `true`, cannot be `false` (confirmed default) | Default-import CommonJS freely. |
| `types` | `[]` per the posts | Ambient `@types/*` are no longer auto-included: list them (`"types": ["bun"]`), or `["*"]` for the old behavior. |
| `rootDir` | `./` per the posts (`--help` still says "computed") | Set `rootDir: "./src"` if emitting and `tsconfig.json` sits above `src`. |

**Removed or no-op in 7.0** (hard errors that have no effect, per the 7.0 beta post):
`target: es5`; `downlevelIteration`; `moduleResolution: node`/`node10` and
`classic`; `module: amd | umd | systemjs | none`; `baseUrl` (rewrite `paths`
relative to the project root); `alwaysStrict: false`; `esModuleInterop: false`;
the `module` keyword in namespace declarations (write `namespace`); `asserts` on
imports (use `with`); command-line file arguments when a `tsconfig.json` is present
without `--ignoreConfig`. Note: `tsc --help --all` on 7.0.2 still prints
`--baseUrl` and `--downlevelIteration`; treat the release post as authoritative and
do not use them. `moduleResolution bundler` can now be combined with
`module commonjs` as the upgrade path from `node10`.

**Language and resolution additions.** Subpath imports starting with `#/`
(`"imports": {"#/*": "./dist/*"}`) are supported under `nodenext` and `bundler`
(6.0). `this`-less method-syntax functions are no longer "context sensitive", so
generic inference sees them earlier (6.0). `import ... assert {}` is deprecated in
favor of `with`. 7.0 reworked JS-file checking: values cannot appear where types are
expected, `@enum` and Closure types are not recognized, postfix `!` is not supported
in JSDoc.

**Options that shape how you write code (all available in 7.0.2):**

32. **`erasableSyntaxOnly` (5.8).** Errors on constructs with runtime semantics that
    are not ECMAScript: `enum`, `namespace`/`module` with runtime code, class
    parameter properties, `import x = require()` / `export =`, and `<T>x` assertions.
    Node 23.6+ runs `.ts` files by erasing types and needs exactly this subset
    (`--experimental-strip-types`). Combine with `verbatimModuleSyntax`.
    **Disagrees:** Google (parameter properties, enums). This repo's strict config sets
    it on; it wins.
33. **`verbatimModuleSyntax`.** Anything not written `import type` / `export type`
    is kept; type-only imports must say so. Replaces `importsNotUsedAsValues` and
    `preserveValueImports`.
34. **`isolatedModules`.** Each file must be transpilable alone (no `const enum` across
    files, re-exports of types need `export type`). Required by Bun/esbuild/SWC/oxc.
35. **`isolatedDeclarations` (5.5).** Exports need enough explicit annotation for a
    tool to emit `.d.ts` without type inference: exported functions need return
    types, exported consts need annotations or literal initializers. Use in
    libraries and monorepo packages for parallel builds.
    **Disagrees:** Google and Effective TypeScript Item 18 say not to annotate
    inferable types; for exports under this flag you must.
36. **`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`,
    `noPropertyAccessFromIndexSignature`, `noImplicitReturns`,
    `noFallthroughCasesInSwitch`** are not in `strict` and not on by default
    (`noImplicitOverride` default false, confirmed). Turn them on in new projects.
37. **`moduleDetection: "force"`** treats every non-declaration file as a module,
    preventing accidental global scripts.
38. **`rewriteRelativeImportExtensions`** rewrites `./x.ts` imports to `./x.js` on
    emit; `allowImportingTsExtensions` requires `noEmit` or `emitDeclarationOnly` and
    `moduleResolution bundler`. Write real extensions (`./x.ts`) when running via
    Node type stripping or Bun.

A minimal 7.0 tsconfig for a Bun/bundler app, with `strict`, `target`, and
`moduleResolution` left at their defaults:

```jsonc
{
  "compilerOptions": {
    "module": "preserve",
    "types": ["bun"],
    "noEmit": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "erasableSyntaxOnly": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "moduleDetection": "force",
    "skipLibCheck": true
  }
}
```

## Where this source sits among the others

- It defines behavior; the style guides define taste. When Google says `enum` is fine
  and the handbook's tsconfig reference says `erasableSyntaxOnly` forbids it, follow
  the flag your project sets.
- Its guidance on `interface` vs `type` is a heuristic, not a rule; it is the
  weakest of the three sources on that question.
- Pre-6.0 handbook pages (anything telling you to set `target: es5`, `baseUrl`, or
  `moduleResolution node`) are out of date for TypeScript 7.

Sources:
- https://www.typescriptlang.org/docs/handbook/
- https://www.typescriptlang.org/docs/handbook/declaration-files/do-s-and-don-ts.html
- https://www.typescriptlang.org/docs/handbook/2/narrowing.html
- https://www.typescriptlang.org/docs/handbook/2/generics.html
- https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-8.html
- https://www.typescriptlang.org/docs/handbook/release-notes/typescript-6-0.html
- https://devblogs.microsoft.com/typescript/announcing-typescript-6-0/
- https://devblogs.microsoft.com/typescript/announcing-typescript-7-0-beta/
- https://www.typescriptlang.org/tsconfig/
