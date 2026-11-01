# React Compiler 1.x (digest)

Sources: "React Compiler v1.0" (https://react.dev/blog/2025/10/07/react-compiler-1, 2025-10-07),
the Introduction page (https://react.dev/learn/react-compiler/introduction), and the Installation,
Incremental Adoption, Debugging, `"use no memo"`, and Configuration pages under
https://react.dev/learn/react-compiler and https://react.dev/reference/react-compiler. Read this
when deciding whether to write `useMemo`, `useCallback`, or `memo`, when adopting the compiler in
an existing app, or when a compiled component misbehaves. The docs call the compiler stable and
production-ready; the 1.0 release is "battle tested on major apps at Meta."

## What it is

A build-time tool that automatically memoizes components and hooks. It is a Babel plugin
(`babel-plugin-react-compiler`) wrapped around a core that is decoupled from Babel; swc support
(used by Next.js 15.3.1+) and oxc support are in progress. It is a build step, not a TypeScript
feature, so it doesn't interact with `tsc`/`tsgo` typechecking. It works with React 19 best and
supports React 17 and 18 through `target` plus the `react-compiler-runtime` package. It lowers
code to its own control-flow-graph IR and analyzes data flow and mutability, which lets it
memoize conditionally, even after an early return, which manual `useMemo` cannot.

## What it memoizes

Focused on update performance:

1. **Skipping cascading re-renders.** When a parent re-renders, children whose inputs didn't
   change are reused. In the docs' `FriendList`, `<FriendListCard>` output survives a change in
   the online count and `<MessageButton>` doesn't re-render.
2. **Skipping expensive calculations** done during render of a component or hook.

Limits the docs call out:

- It only memoizes React components and hooks, not arbitrary functions.
- Its memoization is not shared across components. An expensive function used in many components
  is recomputed per component, so memoize it outside React if profiling says so.
- 1.0 added optional chains and array indices as dependencies, for fewer re-renders.

The docs also show why manual memoization is brittle: `useCallback(handleClick)` plus
`onClick={() => handleClick(item)}` creates a new arrow every render and defeats the memo, while
the compiler optimizes it correctly with or without the arrow.

## What to do about `useMemo`, `useCallback`, `memo`

The docs' guidance, identical in the Introduction and the 1.0 post:

| Code | Recommendation |
| --- | --- |
| New code | Rely on the compiler; use `useMemo`/`useCallback` "where needed to achieve precise control" |
| Existing code | Leave existing memoization in place (removing it can change compilation output) or remove it only after careful testing |
| A memoized value used as an Effect dependency | Keep `useMemo`/`useCallback`; the stated use case is keeping an Effect from firing repeatedly when its dependencies don't meaningfully change |

So the hooks remain as an escape hatch for control, not as the default. A "profile before
memoizing" step comes first in both worlds (the You Might Not Need an Effect page: roughly 1 ms or
more per interaction is worth a look).

## Rules of React are the contract

The compiler assumes the Rules of React (see `rules-of-react.md`). When it sees code that might
break them it **skips optimization rather than risk changing behavior**; build errors are rare. The
residual risk is runtime: code that breaks a rule in a way the compiler cannot detect gets compiled
and may misbehave. The debugging page names the typical breakers: code that relies on
memoization *for correctness*, namely effects that depend on referential equality, dependency
arrays that need stable references (effects over-firing, infinite loops), and reference-equality
checks used for caching.

- The ESLint rules live in `eslint-plugin-react-hooks` (v6 and later, `recommended` preset), do
  not require the compiler to be installed, and replace the old `eslint-plugin-react-compiler`.
  Examples named in the 1.0 post: `set-state-in-render`, `set-state-in-effect`, `refs`.
- Debug workflow from the docs: add `"use no memo"` at the top of a function body to opt it out.
  If the bug disappears, it's likely a rules violation; also try removing manual memoization from
  that component. Fix, then remove the directive and verify the component shows the ✨ badge in
  React DevTools. The directive is a temporary debugging tool: it must be first in the function
  body, with single or double quotes, takes precedence over every compilation mode, and works at
  module level too (a function-level directive overrides it).

## Adoption

```js skip
// babel.config.js: the compiler must run FIRST in the plugin pipeline
module.exports = { plugins: ["babel-plugin-react-compiler"] };
```

- Install as a dev dependency: `babel-plugin-react-compiler@latest` (pin with `--save-exact` if
  tests are thin).
- Vite: `@vitejs/plugin-react` 6.0.0+ with `reactCompilerPreset()` through
  `@rolldown/plugin-babel`; older plugin versions take the Babel plugin inline. `create-vite`,
  `create-next-app`, and Expo SDK 54+ templates ship with it on.
- Incremental rollout, three approaches: Babel `overrides` per directory, opt-in with
  `compilationMode: "annotation"` and a `"use memo"` directive, or runtime `gating` with a feature
  flag. Useful for A/B-measuring the effect.
- `panicThreshold: "none"` (recommended for production) skips components with errors instead of
  failing the build. `target` sets the React version (17, 18, or 19).

### Upgrading the compiler

The 1.0 post warns that a future compiler may memoize more granularly, so a value that was
memoized and used as an Effect dependency may stop (or start) being stable, causing over- or
under-firing in code that leaned on identity. Mitigations: follow the Rules of React, keep
end-to-end tests, and **pin an exact compiler version if test coverage is weak**, upgrading
manually.

## What it does not do

- It does not fix impure render, mutated props, or missing Effect dependencies.
- It does not make Effects unnecessary: avoid-the-Effect rules apply fully (see
  `you-might-not-need-an-effect.md`).
- It does not remove the need to design state well. Derive-in-render code is what it optimizes
  best.
- It is optional today; the docs say some future features "may require the compiler."

## Decision for this skill

New React 19 code in a compiled project: write plain components and plain handlers. Do not
sprinkle `useMemo`/`useCallback`. Add one only when an Effect dependency needs a stable identity
and the alternatives in `removing-effect-dependencies.md` (move inside the Effect, extract
primitives, Effect Event) don't fit, and leave a comment saying why. In an uncompiled project,
memoize after measuring.
