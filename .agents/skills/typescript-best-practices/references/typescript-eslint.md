# typescript-eslint strict and stylistic rules (digest)

Source: typescript-eslint, https://typescript-eslint.io , specifically the
`strict-type-checked` and `stylistic-type-checked` shared configs
(https://typescript-eslint.io/users/configs/), with rule lists read from the config
sources in the `typescript-eslint/typescript-eslint` repo, and oxlint rule availability
read from https://oxc.rs/docs/guide/usage/linter/rules.html and
https://oxc.rs/docs/guide/usage/linter/type-aware.html. The rules are the machine
form of "what the type checker alone will not catch": unsound `any` flow, unhandled
Promises, redundant assertions, unsafe enum use. Consult this file when deciding which
lint rule backs a guideline, when a rule fires and you need its intent, or when picking
between ESLint and oxlint. `strict-type-checked` contains `recommended-type-checked`
plus stricter rules; the docs warn it is not semver-stable and suits teams where a
nontrivial share is proficient in TypeScript. `stylistic-type-checked` is separate and
has no effect on program logic.

## 1. Choosing the linter

1. **Use oxlint for speed and ESLint (typescript-eslint) only where oxlint lacks the
   rule.** Oxlint (Rust) runs standard rules; type-aware rules in the `typescript/*`
   namespace run through `tsgolint`, which is built on typescript-go.
2. **Enable type-aware linting with `oxlint --type-aware` or `"options":
   {"typeAware": true}` in the root config, and install `oxlint-tsgolint`.** It needs
   TypeScript 7.0+ and a tsconfig free of options removed in 6/7 (for example `baseUrl`).
   The docs say "59 out of 61" typescript-eslint type-aware rules are supported; they
   do not say which two are missing in the page read, so check a rule before relying on
   it.
3. **Inline disables use the oxlint spelling:** `// oxlint-disable-next-line
   typescript/no-floating-promises`. Report stale ones with
   `--report-unused-disable-directives`.
4. **In the tables, "(type-aware)" means oxlint marks the rule with the type-aware
   icon and it only runs with `--type-aware`.** Rules whose oxlint category is `nursery`
   (here `no-unnecessary-condition`, `prefer-optional-chain`) are unstable and not on by
   default. Five typescript-eslint rules are extensions of core ESLint rules and live
   under `eslint/` in oxlint.

## 2. `strict-type-checked` (70 rules)

Group by purpose when reading: async correctness (`await-thenable`,
`no-floating-promises`, `no-misused-promises`, `require-await`, `return-await`,
`only-throw-error`, `prefer-promise-reject-errors`); the `no-unsafe-*` family (stop
`any` leaking); redundancy (`no-unnecessary-*`, `no-redundant-type-constituents`,
`no-duplicate-type-constituents`); suspicious values (`no-base-to-string`,
`restrict-plus-operands`, `restrict-template-expressions`, `no-misused-spread`);
TypeScript-only constructs (`no-namespace`, `no-mixed-enums`, `prefer-literal-enum-member`).

| Rule | Why | oxlint |
| --- | --- | --- |
| `await-thenable` | `await` on a non-Promise is a bug or a missing type. | `typescript/await-thenable` (type-aware) |
| `ban-ts-comment` | `@ts-ignore` is banned; `@ts-expect-error` needs a description; `@ts-nocheck` banned. | `typescript/ban-ts-comment` |
| `no-array-constructor` | `new Array(3)` vs `new Array(3, 4)` behave differently; use literals. | `eslint/no-array-constructor` |
| `no-array-delete` | `delete arr[i]` leaves a hole; use `splice`. | `typescript/no-array-delete` (type-aware) |
| `no-base-to-string` | Stringifying an object without its own `toString` yields `[object Object]`. | `typescript/no-base-to-string` (type-aware) |
| `no-confusing-void-expression` | Returning or using a `void` call as a value hides a mistake. | `typescript/no-confusing-void-expression` (type-aware) |
| `no-deprecated` | Calls to APIs marked `@deprecated` get fixed before the removal. | `typescript/no-deprecated` (type-aware) |
| `no-duplicate-enum-values` | Two members sharing a value is almost always a typo. | `typescript/no-duplicate-enum-values` |
| `no-duplicate-type-constituents` | `A | A` is noise. | `typescript/no-duplicate-type-constituents` (type-aware) |
| `no-dynamic-delete` | `delete obj[key]` with a computed key: use a `Map` or `Omit`. | `typescript/no-dynamic-delete` |
| `no-empty-object-type` | `{}` means "any non-nullish value", rarely intended; use `object`/`unknown`/`Record`. | `typescript/no-empty-object-type` |
| `no-explicit-any` | `any` disables checking; use `unknown` and narrow. | `typescript/no-explicit-any` |
| `no-extra-non-null-assertion` | `x!!` is redundant. | `typescript/no-extra-non-null-assertion` |
| `no-extraneous-class` | A class of only statics or an empty class is a module or an object. | `typescript/no-extraneous-class` |
| `no-floating-promises` | An unawaited Promise swallows errors; `await`, `.catch`, or `void` on purpose. | `typescript/no-floating-promises` (type-aware) |
| `no-for-in-array` | `for...in` over an array yields string indices. | `typescript/no-for-in-array` (type-aware) |
| `no-generated-empty-object-type` | Keeps generated `{}` types from creeping in. | `typescript/no-generated-empty-object-type` (type-aware) |
| `no-implied-eval` | `setTimeout("code")` is `eval`. | `typescript/no-implied-eval` (type-aware) |
| `no-invalid-void-type` | `void` only as a return type or generic argument. | `typescript/no-invalid-void-type` |
| `no-meaningless-void-operator` | `void` on a value already `void`/`undefined` does nothing. | `typescript/no-meaningless-void-operator` (type-aware) |
| `no-misused-new` | `new` in an interface or `constructor` in a type is wrong. | `typescript/no-misused-new` |
| `no-misused-promises` | A Promise in a condition or a void callback slot (`forEach(async ...)`) is dropped. | `typescript/no-misused-promises` (type-aware) |
| `no-misused-spread` | Spreading a string, Promise, or class instance gives surprising results. | `typescript/no-misused-spread` (type-aware) |
| `no-mixed-enums` | An enum mixing number and string members confuses reverse mapping. | `typescript/no-mixed-enums` (type-aware) |
| `no-namespace` | `namespace` is non-erasable and legacy; use modules. | `typescript/no-namespace` |
| `no-non-null-asserted-nullish-coalescing` | `x! ?? y` contradicts itself. | `typescript/no-non-null-asserted-nullish-coalescing` |
| `no-non-null-asserted-optional-chain` | `a?.b!` asserts away the very check just made. | `typescript/no-non-null-asserted-optional-chain` |
| `no-non-null-assertion` | `!` bypasses null checks; narrow instead. | `typescript/no-non-null-assertion` |
| `no-redundant-type-constituents` | `string | "a"` collapses; `any | T` is `any`. | `typescript/no-redundant-type-constituents` (type-aware) |
| `no-require-imports` | `require()` in TS escapes module checking; use `import`. | `typescript/no-require-imports` |
| `no-this-alias` | `const self = this` in modern code: use an arrow function. | `typescript/no-this-alias` |
| `no-unnecessary-boolean-literal-compare` | `x === true` where `x: boolean`. | `typescript/no-unnecessary-boolean-literal-compare` (type-aware) |
| `no-unnecessary-condition` | A check the types prove always/never true is dead code or a wrong type. | `typescript/no-unnecessary-condition` (type-aware) |
| `no-unnecessary-template-expression` | `` `${str}` `` with nothing else. | `typescript/no-unnecessary-template-expression` (type-aware) |
| `no-unnecessary-type-arguments` | Passing the default type argument explicitly. | `typescript/no-unnecessary-type-arguments` (type-aware) |
| `no-unnecessary-type-assertion` | An `as` that does not change the type. | `typescript/no-unnecessary-type-assertion` (type-aware) |
| `no-unnecessary-type-constraint` | `<T extends any>` and `<T extends unknown>` do nothing. | `typescript/no-unnecessary-type-constraint` |
| `no-unnecessary-type-conversion` | `String(s)`, `Number(n)`, `!!b` on values already that type. | `typescript/no-unnecessary-type-conversion` (type-aware) |
| `no-unnecessary-type-parameters` | A type parameter used once: use the concrete type (Effective TS Item 51). | `typescript/no-unnecessary-type-parameters` (type-aware) |
| `no-unsafe-argument` | Passing `any` into a typed parameter leaks unsafety. | `typescript/no-unsafe-argument` (type-aware) |
| `no-unsafe-assignment` | Assigning `any` to a typed variable. | `typescript/no-unsafe-assignment` (type-aware) |
| `no-unsafe-call` | Calling an `any` value. | `typescript/no-unsafe-call` (type-aware) |
| `no-unsafe-declaration-merging` | Class/interface merging gives properties no initializer check. | `typescript/no-unsafe-declaration-merging` |
| `no-unsafe-enum-assignment` | Assigning a plain number/string to an enum-typed value. | `typescript/no-unsafe-enum-assignment` (type-aware) |
| `no-unsafe-enum-comparison` | Comparing an enum with a literal of its underlying type. | `typescript/no-unsafe-enum-comparison` (type-aware) |
| `no-unsafe-function-type` | The `Function` type is callable with anything; write a signature. | `typescript/no-unsafe-function-type` |
| `no-unsafe-member-access` | Reading a property off `any`. | `typescript/no-unsafe-member-access` (type-aware) |
| `no-unsafe-return` | Returning `any` from a typed function. | `typescript/no-unsafe-return` (type-aware) |
| `no-unsafe-unary-minus` | `-x` on a non-number. | `typescript/no-unsafe-unary-minus` (type-aware) |
| `no-unused-expressions` | An expression statement with no effect is a typo. | `eslint/no-unused-expressions` |
| `no-unused-vars` | Dead variables and parameters; allow a `_` prefix. | `eslint/no-unused-vars` |
| `no-useless-constructor` | A constructor that only calls `super` or is empty. | `eslint/no-useless-constructor` |
| `no-useless-default-assignment` | A default that can never apply because the value is never `undefined`. | `typescript/no-useless-default-assignment` (type-aware) |
| `no-wrapper-object-types` | `String`, `Number`, `Boolean`, `Symbol`, `BigInt`, `Object` types. | `typescript/no-wrapper-object-types` |
| `only-throw-error` | Throw `Error` objects, not strings. | `typescript/only-throw-error` (type-aware) |
| `prefer-as-const` | `as const` over a hand-written literal assertion. | `typescript/prefer-as-const` |
| `prefer-literal-enum-member` | Enum members should be literals, not computed. | `typescript/prefer-literal-enum-member` |
| `prefer-namespace-keyword` | Use `namespace`, never `module`, if namespaces exist. | `typescript/prefer-namespace-keyword` |
| `prefer-promise-reject-errors` | `Promise.reject` with an `Error`. | `typescript/prefer-promise-reject-errors` (type-aware) |
| `prefer-reduce-type-parameter` | `reduce<T>(...)` over `reduce(...) as T`. | `typescript/prefer-reduce-type-parameter` (type-aware) |
| `prefer-return-this-type` | Fluent methods return `this`, not the class name. | `typescript/prefer-return-this-type` (type-aware) |
| `related-getter-setter-pairs` | A getter and setter must agree on types. | `typescript/related-getter-setter-pairs` (type-aware) |
| `require-await` | An `async` function with no `await` is misleading. | `typescript/require-await` (type-aware) |
| `restrict-plus-operands` | `+` only with two numbers or two strings. | `typescript/restrict-plus-operands` (type-aware) |
| `restrict-template-expressions` | Only strings (and numbers, per options) in `${}`; no objects, no `undefined`. | `typescript/restrict-template-expressions` (type-aware) |
| `return-await` | Inside `try`/`catch`, `return await` so errors are caught. | `typescript/return-await` (type-aware) |
| `triple-slash-reference` | Use imports instead of `/// <reference>`. | `typescript/triple-slash-reference` |
| `unbound-method` | A method detached from its instance loses `this`. | `typescript/unbound-method` (type-aware) |
| `unified-signatures` | Overloads that differ in one parameter should be a union. | `typescript/unified-signatures` |
| `use-unknown-in-catch-callback-variable` | `.catch(e => ...)` parameter should be typed `unknown`. | `typescript/use-unknown-in-catch-callback-variable` (type-aware) |

## 3. `stylistic-type-checked` (21 rules)

| Rule | Why | oxlint |
| --- | --- | --- |
| `adjacent-overload-signatures` | Keep overloads together. | `typescript/adjacent-overload-signatures` |
| `array-type` | One array spelling; default `T[]` for simple, `Array<T>` for complex. | `typescript/array-type` |
| `ban-tslint-comment` | Delete dead `tslint:disable` comments. | `typescript/ban-tslint-comment` |
| `class-literal-property-style` | Prefer `readonly x = 1` over a getter returning a literal. | `typescript/class-literal-property-style` |
| `consistent-generic-constructors` | Put type arguments on one side: `new Map<K, V>()`. | `typescript/consistent-generic-constructors` |
| `consistent-indexed-object-style` | `Record<K, V>` over `{[k: K]: V}`. | `typescript/consistent-indexed-object-style` |
| `consistent-type-assertions` | `as T`, never `<T>x`; no object-literal assertions. | `typescript/consistent-type-assertions` |
| `consistent-type-definitions` | `interface` for object types (configurable). | `typescript/consistent-type-definitions` |
| `dot-notation` | `obj.prop`, not `obj["prop"]`; respects `noPropertyAccessFromIndexSignature`. | `typescript/dot-notation` (type-aware) |
| `no-confusing-non-null-assertion` | `a! == b` reads like `a !== b`. | `typescript/no-confusing-non-null-assertion` |
| `no-empty-function` | An empty function body hides intent; comment or remove. | `eslint/no-empty-function` |
| `no-inferrable-types` | `x: number = 5` is noise. | `typescript/no-inferrable-types` |
| `non-nullable-type-assertion-style` | `x!` over `x as T` when removing `null`/`undefined`. | `typescript/non-nullable-type-assertion-style` (type-aware) |
| `prefer-find` | `.find()` over `.filter()[0]`. | `typescript/prefer-find` (type-aware) |
| `prefer-for-of` | `for...of` when the index is only used to read. | `typescript/prefer-for-of` |
| `prefer-function-type` | A one-call-signature interface is a function type. | `typescript/prefer-function-type` |
| `prefer-includes` | `.includes()` over `indexOf() !== -1`. | `typescript/prefer-includes` (type-aware) |
| `prefer-nullish-coalescing` | `??` over `||` so `0` and `""` survive. | `typescript/prefer-nullish-coalescing` (type-aware) |
| `prefer-optional-chain` | `a?.b` over `a && a.b`. | `typescript/prefer-optional-chain` (type-aware) |
| `prefer-regexp-exec` | `RegExp#exec` over `String#match` without `g`. | `typescript/prefer-regexp-exec` (type-aware) |
| `prefer-string-starts-ends-with` | `startsWith`/`endsWith` over slices and regex. | `typescript/prefer-string-starts-ends-with` (type-aware) |

## 4. Rules to treat as the enforcement of a guideline

- `no-explicit-any` + all `no-unsafe-*`: Effective TypeScript Items 5, 43-46 and the
  handbook's "Don't use `any`".
- `no-floating-promises` + `no-misused-promises`: the single most common real bug this
  config catches; keep both on.
- `no-unnecessary-condition`, `no-unnecessary-type-assertion`: tell you when a type is
  wrong or an `as` is dead (Item 9). Treat a firing as a type bug first.
- `no-non-null-assertion`: replace `!` with a narrow or an explicit check.
- `no-namespace`, `no-mixed-enums`, `prefer-literal-enum-member`: partial backstops for
  `erasableSyntaxOnly`; the compiler flag is the real gate, since no rule here bans
  `enum` outright.
- `no-unnecessary-type-parameters`: Effective TypeScript Item 51 as a rule.
- `consistent-type-imports` and `no-import-type-side-effects` are not in either config;
  `verbatimModuleSyntax` in tsconfig does that job.

## Where this source disagrees with the others

- **`consistent-type-definitions`** defaults to `interface`: agrees with Google and the
  handbook heuristic; Effective TypeScript Item 13 is neutral if consistent. The
  skill's choice is `interface` for plain object shapes.
- **`array-type`** default option enforces `T[]` for every element type; Google uses
  `T[]` only for simple types and `Array<T>` for complex ones. Configure
  `{ default: "array-simple" }` to match Google.
- **`ban-ts-comment`** allows `@ts-expect-error` with a description; Google bans all
  three outside narrow test use. The skill picks: no `@ts-ignore`, `@ts-expect-error`
  only with a reason.
- **`no-non-null-assertion`** forbids `!` outright; Google allows it with a documented
  invariant. The skill follows the rule.
- **`no-extraneous-class`** rejects static-only classes, agreeing with Google's "no
  container classes".
- **`dot-notation`** conflicts with `noPropertyAccessFromIndexSignature` unless
  configured; the typescript-eslint version honors that flag, the core rule does not.
- **Enums:** nothing here bans plain `enum`; `no-mixed-enums`, `no-unsafe-enum-*`
  only police their use. `erasableSyntaxOnly` does the banning.
- **Version coupling:** typescript-eslint imports the `typescript` package API.
  TypeScript 7 does not ship a stable programmatic API until 7.1 or later, so it needs
  `typescript@npm:@typescript/typescript6` (per the 7.0 beta post). Oxlint's type-aware
  mode uses typescript-go directly and avoids that.

Sources:
- https://typescript-eslint.io/users/configs/
- https://typescript-eslint.io/rules/
- https://github.com/typescript-eslint/typescript-eslint/tree/main/packages/eslint-plugin/src/configs/eslintrc
- https://oxc.rs/docs/guide/usage/linter/rules.html
- https://oxc.rs/docs/guide/usage/linter/type-aware.html
