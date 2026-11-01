# Effective TypeScript (digest)

Source: *Effective TypeScript: 83 Specific Ways to Improve Your TypeScript*, 2nd
edition, by Dan Vanderkam (O'Reilly, May 2024), https://effectivetypescript.com . The
item titles and numbering below are the official table of contents from the book's
sample repo, https://github.com/danvk/effective-typescript (samples checked with
TypeScript 5.4.5). Each line gives the rule and, where the title alone would not say
it, the reason. Read this when you are making a type-design call: how to model data,
when to assert, when to reach for generics, what to do about `any`. Item numbers are
the book's; cite them as "Item N". The book targets TypeScript 5.4; the 6.0/7.0
default changes are in typescript-handbook.md.

## Chapter 1. Getting to Know TypeScript

1. **Understand the relationship between TypeScript and JavaScript.** TS is a
   superset: every valid JS program is valid TS syntax, and type errors do not stop
   emit.
2. **Know which TypeScript options you are using.** Run with `strict` (at least
   `noImplicitAny` and `strictNullChecks`); the same code means different things under
   different settings.
3. **Understand that code generation is independent of types.** Types are erased:
   you cannot branch on them at runtime, and type errors do not change output.
4. **Get comfortable with structural typing.** A value is assignable if it has the
   needed shape, so do not assume a parameter is exactly the class you named.
5. **Limit use of the `any` type.** It turns off checking, breaks refactoring and
   editor help, and hides the design.

## Chapter 2. TypeScript's Type System

6. **Use your editor to interrogate and explore the type system.** Hover, go to
   definition, and the language service answer most "what type is this" questions.
7. **Think of types as sets of values.** `never` is the empty set, unions are set
   union, `extends` is subset; this explains assignability and narrowing.
8. **Know how to tell whether a symbol is in the type space or value space.** `class`
   and `enum` live in both; `typeof` crosses from value to type.
9. **Prefer type annotations to type assertions.** An annotation checks the value; an
   assertion overrides the checker. Assert only when you know more than it does.
10. **Avoid object wrapper types (`String`, `Number`, `Boolean`, `Symbol`, `BigInt`).**
    Use the lowercase primitives.
11. **Distinguish excess property checking from type checking.** Fresh object
    literals get an extra check; the same object via a variable does not.
12. **Apply types to entire function expressions when possible.** One `type Fn = ...`
    on the variable beats annotating each parameter and the return.
13. **Know the differences between `type` and `interface`.** Know both syntaxes, declaration
    merging (`interface`) vs type inlining (`type`). For projects with no established
    style, prefer `interface` for object types.
14. **Use `readonly` to avoid errors associated with mutation.** On parameters it
    states "I will not mutate this" and catches accidental writes.
15. **Use type operations and generic types to avoid repeating yourself.** `Pick`,
    `Omit`, `Partial`, mapped types, `typeof`, `ReturnType`, `keyof`, rather than
    copied property lists.
16. **Prefer more precise alternatives to index signatures.** Use `Record` over a
    finite key union, `Map`, interfaces, or `noUncheckedIndexedAccess`; a bare
    `{[k: string]: T}` says almost nothing.
17. **Avoid numeric index signatures.** JS array keys are strings anyway; use an
    array, tuple, or `ArrayLike`.

## Chapter 3. Type Inference and Control Flow Analysis

18. **Avoid cluttering your code with inferable types.** Annotate function
    boundaries (parameters, and returns of exported functions), not every local.
19. **Use different variables for different types.** A variable has one type; reusing
    it for another forces unions.
20. **Understand how a variable gets its type.** `const` infers the narrowest literal,
    `let` widens; use `as const` or an annotation to control it.
21. **Create objects all at once.** Build with a literal and spread, not by adding
    properties afterward, so the type is correct without assertions.
22. **Understand type narrowing.** `typeof`, `instanceof`, `in`, truthiness,
    discriminant checks, and user-defined type guards all narrow; know which do.
23. **Be consistent in your use of aliases.** If you alias `obj.prop`, narrowing the
    alias does not narrow the original; destructure once and use the alias.
24. **Understand how context is used in type inference.** Extracting a value out of
    its context (a literal into a `const`, a callback into a variable) loses
    contextual types; annotate or keep it inline.
25. **Understand evolving types.** An implicit-`any` array or variable gets its type
    from later pushes; fine for locals, but prefer an explicit type.
26. **Use functional constructs and libraries to help types flow.** `map`, `filter`,
    `flatMap`, and utility libraries carry types through where loops do not.
27. **Use `async` functions instead of callbacks to improve type flow.** `await`
    gives the resolved type directly; async functions always return a `Promise`.
28. **Use classes and currying to create new inference sites.** When one generic
    call cannot infer everything, split it into two calls so each infers once.

## Chapter 4. Type Design

29. **Prefer types that always represent valid states.** Make illegal states
    unrepresentable: a discriminated union over several optional fields.
30. **Be liberal in what you accept and strict in what you produce.** Parameters take
    broad types (`Iterable`, `readonly T[]`); return values are specific.
31. **Don't repeat type information in documentation.** No `{string}` in comments, no
    "returns a number"; say what the types cannot (units, mutation).
32. **Avoid including `null` or `undefined` in type aliases.** The nullability then
    spreads invisibly; add it at the use site.
33. **Push null values to the perimeter of your types.** Prefer one object that is
    wholly null or wholly present over many nullable fields.
34. **Prefer unions of interfaces to interfaces with unions.** `{type:'a'; x} | {type:'b'; y}`
    beats `{type:'a'|'b'; x?; y?}`; narrowing then works.
35. **Prefer more precise alternatives to string types.** String literal unions,
    `keyof T`, template literal types.
36. **Use a distinct type for special values.** Do not encode "none" as `-1` or `''`
    inside `number` or `string`; use `null`, a union member, or a tagged variant.
37. **Limit the use of optional properties.** Each one doubles the states; prefer
    separate types or required fields with explicit `null`.
38. **Avoid repeated parameters of the same type.** Three `string` parameters are
    easy to swap; take an options object or use distinct types.
39. **Prefer unifying types to modeling differences.** Two nearly-identical types
    (client vs server) cost more than one shared type with a few extras.
40. **Prefer imprecise types to inaccurate types.** A loose but correct type beats a
    precise one that is sometimes wrong.
41. **Name types using the language of your problem domain.** Vocabulary of the
    business, not of the implementation; avoid `Item`, `Data`, `Info`.
42. **Avoid types based on anecdotal data.** Generate types from a schema or spec
    instead of from a few sample payloads.

## Chapter 5. Unsoundness and the `any` Type

43. **Use the narrowest possible scope for `any` types.** Cast one expression
    (`foo(x as any)`), not the variable, and not with `@ts-ignore`.
44. **Prefer more precise variants of `any` to plain `any`.** `any[]`,
    `{[key: string]: any}`, `() => any`, `Record<string, unknown>`.
45. **Hide unsafe type assertions in well-typed functions.** Put the one `as` inside a
    helper with a correct signature; callers stay safe.
46. **Use `unknown` instead of `any` for values with an unknown type.** `unknown`
    forces a narrow before use; `any` does not.
47. **Prefer type-safe approaches to monkey patching.** Use module augmentation or a
    wrapper, not `(window as any).foo`.
48. **Avoid soundness traps.** Unsoundness is a runtime value diverging from its static
    type: `any`, assertions (`as`, `is`), object and array lookups, inaccurate type
    definitions, mutated parameters (mark them `readonly`), child classes that do not
    match parent methods, and optional properties.
49. **Track your type coverage to prevent regressions in type safety.** Measure the
    share of symbols not `any` (e.g. `type-coverage`) and keep it from dropping.

## Chapter 6. Generics and Type-Level Programming

50. **Think of generics as functions between types.** Type parameters are arguments;
    `extends` is a parameter type; conditional types are `if`.
51. **Avoid unnecessary type parameters.** If a type parameter appears once in the
    signature, it is doing nothing; use the concrete type (the "golden rule").
52. **Prefer conditional types to overload signatures.** One conditional return type
    handles unions of inputs that overloads do not.
53. **Know how to control the distribution of unions over conditional types.** Wrap in
    `[T]` to stop distribution, or use `never` deliberately to filter.
54. **Use template literal types to model DSLs and relationships between strings.**
    Route params, event names, `` `${Prefix}${Name}` `` keys.
55. **Write tests for your types.** Test with `expectTypeOf`-style assertions or
    `tsd`; type-level code regresses silently.
56. **Pay attention to how types display.** Error messages and hovers are the user
    interface of a type; add named intermediate types or `Resolve<T>` flattening.
57. **Prefer tail-recursive generic types.** Recursive types without an accumulator
    hit the depth limit; tail form is optimized.
58. **Consider codegen as an alternative to complex types.** If the type is more than
    a screen, generate it from the source of truth.

## Chapter 7. TypeScript Recipes

59. **Use `never` types to perform exhaustiveness checking.** In the `default` branch,
    assign the value to `never` so a new union member breaks the build.
60. **Know how to iterate over objects.** Parameters may have extra keys; use
    `Object.entries` for any object, `for-in` with an explicit `keyof` assertion only
    when you know the exact keys, and consider `Map`, which is easier to iterate.
61. **Use `Record` types to keep values in sync.** A `Record<Union, X>` fails to
    compile when a union member is added without an entry.
62. **Use rest parameters and tuple types to model variadic functions.** Tuples in rest
    position give typed, arity-correct varargs, including conditional ones.
63. **Use optional `never` properties to model exclusive or.** `{a: T; b?: never} |
    {a?: never; b: T}` makes "one of the two, not both".
64. **Consider brands for nominal typing.** `string & {__brand: 'UserId'}` stops
    mixing IDs of different entities, at zero runtime cost.

## Chapter 8. Type Declarations and `@types`

65. **Put TypeScript and `@types` in `devDependencies`.** They are build-time only.
66. **Understand the three versions involved in type declarations.** The library
    version, the `@types` version, and the TypeScript version can each mismatch.
67. **Export all types that appear in public APIs.** Callers can name them via
    `Parameters<>` anyway, so export them and give them stable names.
68. **Use TSDoc for API comments.** `/** */` with markdown; editors show it on hover.
69. **Provide a type for `this` in callbacks if it is part of their API.** Declare a
    `this:` parameter.
70. **Mirror types to sever dependencies.** Copy the few structural types you need
    rather than forcing consumers to install `@types/foo`.
71. **Use module augmentation to improve types.** Patch third-party or global
    declarations with `declare module`, not forks.

## Chapter 9. Writing and Running Your Code

72. **Prefer ECMAScript features to TypeScript features.** You should be able to convert
    TS to JS by deleting types. Enums, parameter properties, triple-slash imports,
    experimental decorators, and member visibility modifiers (`private`) are the
    historical exceptions; avoid them. Node type stripping and `erasableSyntaxOnly`
    later turned this advice into a compiler-checkable rule (`private` as a keyword
    is erasable and still allowed; the others are not).
73. **Use source maps to debug TypeScript.** Turn `sourceMap` on so debuggers and
    stack traces show `.ts`.
74. **Know how to reconstruct types at runtime.** Types are erased. Options: a runtime
    type system such as Zod, generate TS types from values or a schema
    (`json-schema-to-typescript`), or generate schemas from TS types
    (`typescript-json-schema`). If you already have a schema, make it the source of truth.
75. **Understand the DOM hierarchy.** `Element` vs `HTMLElement` vs `HTMLInputElement`,
    `Event` vs `MouseEvent`; narrow before using specific members.
76. **Create an accurate model of your environment.** Pick `lib`, `types`, and
    `target` that match where the code runs; do not declare globals that do not exist.
77. **Understand the relationship between type checking and unit testing.** Types
    cannot replace tests for values, but tests need not cover what types guarantee.
78. **Pay attention to compiler performance.** Separate build performance from editor
    latency, keep type checking apart from the build, remove dead code and heavy type
    dependencies, use incremental builds and project references, and simplify types:
    avoid large unions, extend interfaces rather than intersecting, annotate returns.

## Chapter 10. Modernization and Migration

79. **Write modern JavaScript.** `class`, `const`, arrow functions, `async`/`await`,
    modules: it converts to TS with fewer surprises.
80. **Use `@ts-check` and JSDoc to experiment with TypeScript.** A low-commitment
    first step for a JS codebase.
81. **Use `allowJs` to mix TypeScript and JavaScript.** Convert incrementally.
82. **Convert module by module up your dependency graph.** Start with leaves so the
    types you import are real.
83. **Do not consider migration complete until you enable `noImplicitAny`.** Start
    loose to get running, then tighten.

## Where this source disagrees with the others

- **`interface` vs `type`:** Item 13 says both work if you are consistent; Google
  says `interface` for objects; the handbook says `interface` until you need `type`.
  The skill follows Google/handbook for plain object shapes.
- **Enums:** Item 72 says prefer ES features to TS ones (no enums, parameter
  properties, experimental decorators). Google allows plain `enum` and parameter properties.
  `erasableSyntaxOnly` sides with the book. Pick the book.
- **Mapped and conditional types:** Items 15, 50-53 promote them; Google warns they
  are hard to read. Use built-in utilities freely, write custom conditional types
  only when an explicit interface cannot.
- **Return type annotations:** Item 18 says omit inferable ones; `isolatedDeclarations`
  requires them on exports. Annotate exports, infer locals.
- **`@ts-expect-error`:** Item 43 tolerates narrowly-scoped suppression; Google bans
  it outside tests. Prefer a one-expression cast to `unknown`-typed values; if you
  must suppress, use `@ts-expect-error` with a reason, never `@ts-ignore`.
- **Currency:** written against TS 5.4. Anything about `strict` being optional (Item
  2), `target`, and `moduleResolution` defaults is superseded by TS 6/7 defaults.

Source: https://effectivetypescript.com ; item list at
https://github.com/danvk/effective-typescript
