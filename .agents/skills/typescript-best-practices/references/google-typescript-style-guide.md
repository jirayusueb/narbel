# Google TypeScript Style Guide (digest)

Source: the Google TS/JS Style Guide, https://google.github.io/styleguide/tsguide.html
(the public edition of Google's internal guide; volunteer-maintained, no automatic
deployment). It is a rulebook of consistency decisions: where two forms are
equivalent it picks one and says so. Read this when you need a tie-breaker on a
style question (default exports, `interface` vs `type`, `#private`, `T[]` vs
`Array<T>`, naming, comments). It is written for code imported into Google, so some
rules are Google-specific (Closure interop, `goog.module`, conformance tools); those
are skipped here. Where it differs from the other digests, the **Disagrees** lines
say so, and the main SKILL.md picks a side.

## Source files and modules

1. **Use named exports; never `export default`.** One import shape everywhere, the
   name is fixed at the definition, and renames are greppable. Default exports also
   tempt people into one big namespacing object.
2. **Use ES modules (`import`/`export`), never `namespace` or `module` blocks, and
   never `require`.** Namespaces are not ECMAScript and complicate tooling.
   Agrees with erasableSyntaxOnly (handbook digest).
3. **Import with a path, relative or rooted; do not rely on file extensions you do
   not need.** Prefer relative paths for the same package, avoid `../../../`
   chains. Both namespace imports (`import * as x`) and named imports are allowed:
   use named for a few clearly-named symbols, namespace when you use many symbols
   or the names are generic (`import * as http`).
4. **Do not rename imports unless you must resolve a collision or the name is
   unclear.** Renames hide where a symbol comes from.
5. **Export only what other modules use.** Smaller public surface, easier changes.
   Do not export mutable bindings (`export let`); export a getter function instead,
   because re-exports of mutable state are hard to debug.
6. **No container classes**: a class with only static members is a module in
   disguise. Export the functions and constants directly.
7. **Use `import type` / `export type` when the symbol is only used as a type.**
   Makes the erasure explicit; under `verbatimModuleSyntax` it is required.

## Language features

8. **`const` by default, `let` only when reassigned, never `var`.** One variable per
   declaration.
9. **Array literals `[]`, never `new Array(n)`; never put properties on arrays.**
   The constructor behaves differently with one argument. Omit unused elements in
   array destructuring (`const [, b] = xs`).
10. **Object literals `{}`, never `new Object()`.** Never use unfiltered
    `for...in` (it walks the prototype chain): filter with an `if` or use
    `for (const k of Object.keys(o))`.
11. **Spread is a shallow copy; later keys replace earlier ones, so order is
    meaning.** Spread only objects into objects and iterables into arrays.
12. **Classes: no semicolons after declarations, no `#private` fields.** Use the
    TypeScript `private`/`protected` keywords instead. Google's reason: `#private`
    down-leveled badly and the type checker already enforces visibility.
    **Disagrees:** with modern runtimes (ES2022+ native `#private` is cheap) and with
    handbook/erasable-syntax thinking where `#x` is plain ECMAScript while `private`
    is erased; pick `#private` only when you need real runtime privacy.
13. **Mark properties never reassigned after construction `readonly`.** No need for
    deep immutability.
14. **Parameter properties (`constructor(private readonly x: X) {}`) are encouraged
    over copying a parameter into a field.** **Disagrees:** `erasableSyntaxOnly`
    (handbook digest) forbids parameter properties because they have runtime
    semantics. In a project with that flag on, write the field explicitly.
15. **Initialize fields where declared when the initializer does not depend on the
    constructor.** Avoid constructors that only exist to assign.
16. **Never manipulate `prototype` directly; prefer module-level functions over
    private static methods; do not rely on dynamic dispatch of static methods.**
17. **Getters must be pure: same result, no observable side effects.** Use them to
    hide implementation detail, not to do work.
18. **Prefer `function` declarations for named top-level functions; arrow functions
    for callbacks and nested closures.** Do not use function expressions
    (`const f = function () {}`); use arrow functions when you need a value.
    Arrow function with a non-trivial body uses a block; use an expression body only
    when the return value is used.
19. **Classes usually should not hold arrow-function properties**; call instance
    methods from an arrow at the call site. Exception: an event handler that must be
    uninstalled later, where the arrow property gives a stable reference.
20. **Parameter default initializers must have no observable side effects and stay
    simple.** Prefer rest and spread over `arguments`.
21. **Write small, focused functions.** No hard limit; split when it does more than
    one thing.
22. **Use `this` only in class constructors and methods, in arrow functions
    inside them, and in functions with an explicit `this` parameter.** Never use
    `this` to refer to the global object or an event target.

## Literals, coercion, control flow

23. **Single quotes for strings; template literals for interpolation or multi-line.**
    No line continuations. (Formatter-enforced in practice.)
24. **Number literals use exactly `0x`, `0o`, `0b` lowercase prefixes, and never a
    leading zero otherwise.** Coerce strings with `Number(x)`, never unary `+` or
    `parseFloat` (the latter ignores trailing garbage), and always handle `NaN`.
25. **Do not compare to boolean coercions of enums, and do not `Boolean(x)` /
    `!!x` an enum.** The first enum member is `0`, hence falsy.
26. **Always use braces for control flow blocks.** Only a single-line `if` with no
    `else` may omit them, on the same line.
27. **Always `===` and `!==`.** Double equals coerces in ways readers cannot predict.
28. **`for...of` for arrays and iterables; never unfiltered `for...in`.**
29. **Throw only `Error` objects, created with `new Error(...)`; never throw
    strings.** Use `new Error('msg', { cause })`, where `cause` must itself be an
    `Error`.
30. **Never leave an empty `catch`; explain in a comment when ignoring is right.**
    Keep `try` blocks focused on the statements that can throw. Narrow the caught
    `unknown` before use.
31. **`switch` needs a `default`, even when exhaustive, and cases must not fall
    through** unless the case body is empty.
32. **Parenthesize only where it clarifies; never around the whole of `delete`,
    `typeof`, `void`, `return`, `throw`, `case`, `in`, `of`, `yield`.**
33. **Do not use assignment inside conditions** unless wrapped in extra parentheses.

## Disallowed features

34. **Never use the wrapper objects `new String`, `new Number`, `new Boolean`;
    never the types `String`, `Number`, `Boolean`, `Symbol`, `BigInt`, `Object`.**
    Use the lowercase primitives and `object`. Same as handbook Do's and Don'ts.
35. **Never rely on automatic semicolon insertion**; end every statement with `;`.
36. **No `const enum`; use plain `enum`.** `const enum` is an optimization that
    makes the enum invisible to JavaScript consumers. Plain `enum` is allowed.
    **Disagrees:** `erasableSyntaxOnly` and Effective TypeScript Item 72 prefer a
    union of string literals or an `as const` object over any `enum`. The main
    SKILL.md picks the `as const` object.
37. **No `debugger`, no `with`, no `eval` / `new Function`, no non-standard
    features (`__defineGetter__`, `Array.observe`), no modifying built-ins or
    globals.** Security and tooling reasons.
38. **Do not define new decorators; use only framework-defined ones.** They diverged
    from the TC39 proposal and have known unfixed bugs.

## Naming

39. **`UpperCamelCase` for classes, interfaces, types, enums, decorators, type
    parameters, and TSX components; `lowerCamelCase` for variables, parameters,
    functions, methods, properties; `CONSTANT_CASE` for module-level constants and
    enum members.** Do not prefix interfaces with `I`, do not suffix types with
    `Type`. **Disagrees:** Effective TypeScript Item 41 and most modern code keep
    enum-like `as const` members `PascalCase` or lowercase strings; CONSTANT_CASE is
    for true constants only.
40. **Names must be descriptive; do not abbreviate by deleting letters.** Names in
    scope for 10 lines or fewer may be short. A leading `_` marks a required but
    unused parameter; a standalone `_` is allowed.
41. **Treat acronyms as words: `loadHttpUrl`, not `loadHTTPURL`.** Never use `$`
    in names unless a framework requires it.
42. **Type parameters are a single upper-case letter or `UpperCamelCase`.**

## Type system

43. **Rely on inference for locals, literals and obvious returns; annotate when it
    clarifies or protects a boundary.** Return type annotations are the author's
    call; reviewers may ask for them on complex functions. **Disagrees:**
    `isolatedDeclarations` (handbook digest) requires explicit annotations on
    exports.
44. **Use `undefined` and `null` consistently; never include `| null` or
    `| undefined` in a type alias**; add it at the use site. Aliases that carry
    nullability spread null handling everywhere.
45. **Optional (`?:`) over `| undefined` for parameters and fields**; do not mix
    `x?: T | undefined` unless `exactOptionalPropertyTypes` makes the difference
    matter.
46. **Prefer structural types: describe what is needed, not the class.** Annotate
    object literals instead of asserting them.
47. **Use `interface` for object shapes, not `type X = {...}`.** The guide gives
    "no benefit to type aliases when there are so many issues around display/perf"
    (quoting the TypeScript team lead). Use `type` for unions, tuples, primitives,
    and mapped types. **Disagrees:** typescript-eslint `consistent-type-definitions`
    agrees (default `interface`), but Effective TypeScript Item 13 says either is
    fine if you are consistent, and the handbook says use `interface` until you
    need `type` features. The skill picks `interface`, except that `type` is
    required for unions and anything a mapped/conditional type touches.
48. **`T[]` and `readonly T[]` for simple element types; `Array<T>` for complex
    ones** (unions, function types, anything with more than letters and dots).
49. **Prefer `Map` and `Set` to index signatures as dictionaries; if you use an
    index signature, label the key (`{[userName: string]: number}`).** `Record<K,
    V>` is for statically-known keys.
50. **Use mapped and conditional types only when an explicit interface cannot do
    it.** The reader must evaluate them mentally, the evaluation model changes
    between compiler versions, and tooling handles them poorly. Prefer an explicit
    `interface` with `extends`. **Disagrees:** Effective TypeScript Items 15 and
    50-53 encourage `Pick`/`Omit`/mapped types to avoid repeating yourself.
    The guide's caution is about cleverness, not about built-in utilities.
51. **Never `any`; use a specific type, or `unknown` and narrow.** If `any` is
    truly needed, suppress the lint with a comment saying why. Never use `{}`
    as a type (means "anything but null/undefined"); use `unknown`, `object`, or
    `Record<string, unknown>`.
52. **Tuples: use them for fixed small groups only; prefer an interface with named
    fields when elements have different meanings.**
53. **Avoid return-type-only generics** (`get<T>(): T`): they are unchecked
    assertions in disguise. If an API has one, always write the type argument.
54. **Do not use `@ts-ignore`, `@ts-expect-error`, or `@ts-nocheck`.** The error is
    usually a symptom of a larger type problem. `@ts-expect-error` is tolerated in
    tests, but cast the one expression instead. **Disagrees:** typescript-eslint
    `ban-ts-comment` (strict) allows `@ts-expect-error` with a description of 3+
    characters, and Effective TypeScript tolerates it in narrow scope (Item 43).
55. **Type assertions use `as T`, never `<T>x`.** Never double-assert
    (`x as unknown as T`) without a comment; avoid `!` non-null assertions unless
    the invariant is documented or checked just above. Use a type annotation, not an
    assertion, on object literals (`const x: T = {...}`).

## Comments and documentation

56. **JSDoc `/** */` for documentation of exports and members; `//` for
    implementation notes.** Do not use block comments for notes. Document every
    top-level export of a module. Do not repeat the type in JSDoc (the types are
    already there): no `@type`, `{string}`, `@returns {number}`.
57. **Comments must add information.** Not "Sets the name." on `setName`. Explain
    why, units, invariants, and what a caller can rely on. Use `/* paramName= */`
    comments at call sites when a literal argument is unclear (or use an options
    object).
58. **Put JSDoc before decorators.** Document parameter properties with `@param`.

## Policies

59. **Consistency with the surrounding file wins over the guide**, but new code
    follows the guide; do not reformat existing code in the same change as a
    behavior change.
60. **Deprecation: mark with `@deprecated` and a pointer to the replacement.**
    Generated code is mostly exempt.

## Where this source sits among the others

- Strictest on hand-written style, weakest on type-system depth: it has no view on
  generics, narrowing, brands, or exhaustiveness. Use Effective TypeScript for those.
- Pre-dates erasable-syntax thinking: its allowance of `enum`, parameter properties,
  and namespaces-as-bad-but-enum-as-fine conflicts with `erasableSyntaxOnly`.
  In this repo `erasableSyntaxOnly` is on, so the erasable rule wins.
- Its "no `@ts-expect-error`" is stricter than typescript-eslint, which allows it
  with a description.

Source: https://google.github.io/styleguide/tsguide.html
