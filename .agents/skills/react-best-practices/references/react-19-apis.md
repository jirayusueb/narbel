# React 19 and 19.2 APIs (digest)

Sources: "React v19" (https://react.dev/blog/2024/12/05/react-19, stable release of 2024-12-05),
"React 19.2" (https://react.dev/blog/2025/10/01/react-19-2), and the reference pages for
`useActionState`, `useOptimistic`, `use`, `useFormStatus`, `useEffectEvent`, and `Activity` on
react.dev. Read this when writing forms, mutations, optimistic UI, Suspense data reading, or
deciding whether an API is safe to use. The installed `@types/react` 19.3 declares every API in
the table, which is the check used for the "stable" column here.

## Status table

| API | Introduced | Status in 19.3 | Typed in `@types/react` 19.3 |
| --- | --- | --- | --- |
| Actions (async functions in transitions) | 19.0 | Stable | yes (`startTransition` accepts async) |
| `useActionState` | 19.0 (was `ReactDOM.useFormState` in Canary) | Stable | yes |
| `<form action={fn}>`, `formAction` | 19.0 | Stable | yes (`react-dom` types) |
| `useFormStatus` (`react-dom`) | 19.0 | Stable | yes |
| `useOptimistic` | 19.0 | Stable | yes |
| `use(promise)`, `use(context)` | 19.0 | Stable | yes |
| `ref` as a prop on function components | 19.0 | Stable | yes |
| `<Context value>` as a provider | 19.0 | Stable | yes |
| Ref callback cleanup functions | 19.0 | Stable | yes |
| `useDeferredValue(value, initialValue)` | 19.0 | Stable | yes |
| `<title>`, `<meta>`, `<link>` hoisting | 19.0 | Stable | yes |
| `<Activity mode>` | 19.2 | Stable (`visible` and `hidden` only) | yes, `@version 19.2.0` |
| `useEffectEvent` | 19.2 | Stable | yes |
| `cacheSignal` (RSC only) | 19.2 | Stable, Server Components only | yes |
| `forwardRef`, `<Context.Provider>` | old | Still work; deprecation planned | yes |

## Actions

By convention a function that runs in an async transition is an **Action**. Actions give you,
without hand-written flags: a pending state (starts when the request starts and resets when the
final state update commits), optimistic updates (`useOptimistic`), error handling (thrown errors
reach the nearest Error Boundary and revert optimistic state), and form integration (`action`
functions run as Actions and **reset uncontrolled forms** on success; call `requestFormReset` to
reset manually).

Before: three `useState` calls (`value`, `error`, `isPending`) and a `try`/`finally`. After:

```tsx skip
const [isPending, startTransition] = useTransition();
startTransition(async () => {
  const error = await updateName(name);
  if (error) { setError(error); return; }
  redirect("/path");
});
```

A state update after an `await` inside an Action needs its own `startTransition`; React does not
treat it as part of the transition automatically.

## `useActionState(action, initialState, permalink?)`

Returns `[state, dispatch, isPending]`. The action receives `(previousState, payload)` and may be
async; unlike a `useReducer` reducer it may perform side effects. Details from the reference:

- Calls are **queued and run sequentially**; each receives the previous result. A burst of clicks
  takes as long as the sum of requests. Pair with `useOptimistic`, or don't use it where requests
  are independent.
- `dispatch` must run inside an Action: `<form action={dispatch}>`, an Action prop, or
  `startTransition`. A call outside logs a development error.
- `dispatch` has a stable identity.
- If the action throws, React cancels queued actions and shows the nearest Error Boundary. Return
  an error value for expected failures.
- The reducer's return type must match the type of `initialState`; annotate the state type if
  TypeScript infers a mismatch.
- `permalink` is for progressive enhancement with Server Functions before JavaScript loads.
- With Server Functions, `initialState` and the payload must be serializable.
- `reducerAction` is not double-invoked by Strict Mode, because it is allowed side effects.

For a `<form>`, the payload is `FormData`; `formData.get("name")` is `FormDataEntryValue | null`,
so narrow with `typeof`.

## `useFormStatus` (from `react-dom`)

```tsx skip
const { pending, data, method, action } = useFormStatus();
```

It reads the status of the **parent** `<form>` "as if the form was a Context provider." It returns
nothing useful for a form rendered in the same component or in children; `pending` will never be
`true` there. Call it in a child such as `SubmitButton`. It exists so design-system components can
read form state without prop drilling.

## `useOptimistic(value, reducer?)`

Returns `[optimisticState, setOptimistic]`. `optimisticState` equals `value` unless an Action is
pending. The setter accepts a value or a pure updater `(pending) => next`, and **must be called
inside an Action**, or React warns and the optimistic state flickers in briefly. Flow: set
optimistic state, await the request, set the real state; optimistic and real state converge in a
single commit (no extra "clear" render). On failure the transition still ends and React renders the
current `value`, which hasn't changed, so the UI reverts without code. The `value` argument decides
what shows after the Action:

| Argument | After the Action |
| --- | --- |
| A hard-coded value (`useOptimistic(false)`) | Returns to it. Good for "pending" flags |
| A prop or state | The latest parent value |
| With a reducer (`useOptimistic(items, fn)`) | Reducer re-runs against the latest `items` if they changed meanwhile |

In an **Action prop** (a prop named `...Action` that the child calls inside a transition) you may
call the setter without `startTransition`, because the prop is already invoked inside one.

## `use`

`use(resource)` reads a Promise or Context during render. It is an API, not a Hook, so it **may
be called in conditions and loops**, which lets you read context after an early return. Caveats from
the reference:

- Must be called inside a component or Hook.
- **Cannot be called in a `try`/`catch`.** Use an Error Boundary for rejection.
- The Promise must be **cached** so the same instance is reused across renders. A Promise created
  in render of a Client Component is new each time and React warns ("suspended by an uncached
  promise"). Pass Promises from a Server Component, a cache, or a Suspense-compatible library or
  framework.
- A Promise passed from Server to Client Component must resolve to a serializable value.
- Reading context with `use` is not supported in Server Components.
- While pending, the nearest `<Suspense>` fallback shows; on rejection, the nearest Error Boundary.

## Ref and context changes

- **`ref` as a prop.** Function components receive `ref` in props; `forwardRef` is no longer
  needed. A codemod is planned; `forwardRef` will be deprecated later. Refs to class components
  are not passed as props.
- **Ref cleanup.** A ref callback may return a cleanup function; React then skips the old
  `ref(null)` call on unmount. Consequence for TypeScript: **a ref callback may not implicitly
  return a value**. `ref={(node) => (instance = node)}` becomes a type error; write
  `ref={(node) => { instance = node; }}`. Codemod: `no-implicit-ref-callback-return`.
- **`<Context value={...}>`** replaces `<Context.Provider value={...}>`.

## 19.2 additions

### `<Activity mode="visible" | "hidden">`

An alternative to conditional rendering that keeps state. Hidden children are hidden with
`display: none`, **their Effects are destroyed** (subscriptions cleaned up), and they **keep
re-rendering at lower priority** on new props. On show, state is restored and Effects re-created.
`mode` defaults to `visible`. A hidden Activity whose child renders only text outputs nothing, as
there is no element to hide. Use for tabs, sidebars, pre-rendering likely navigation targets, and
preserving back-navigation state. A `ViewTransition` around it animates enter/exit under
`startTransition`.

### `useEffectEvent`

See `removing-effect-dependencies.md`. Summary: wraps event-like logic fired from an Effect so it
reads the latest props and state without becoming a dependency; call only from Effects; don't
pass it around; not for silencing the linter.

### Also in 19.2

Batched Suspense reveals for SSR; Partial Pre-rendering APIs (`prerender`, `resume`,
`resumeAndPrerender`); React Performance Tracks in Chrome DevTools; `cacheSignal` for Server
Components; `eslint-plugin-react-hooks` v6 with flat-config `recommended` and opt-in compiler rules.
In Node.js, still prefer the Node Stream server APIs over Web Streams.

## Server Components and Server Actions

Server Components render ahead of time in a separate environment and are stable; the bundler/
framework APIs underneath do not follow semver across 19.x minors (pin the React version if you
build a framework). **There is no directive for Server Components.** `"use server"` marks Server
Actions, async functions callable from Client Components. `"use client"` marks the client boundary.

## Other 19.0 changes worth using

`useDeferredValue(value, initialValue)` returns `initialValue` on first render and schedules a
background re-render with the real value. Document metadata (`<title>`, `<link>`, `<meta>`) can be
rendered anywhere and is hoisted to `<head>`; a router or metadata library is still useful for
route-level overrides. Hydration errors now print a single diff.
