# Rules of React (digest)

Source: React documentation, "Rules of React", https://react.dev/reference/rules and its three
subpages: *Components and Hooks must be pure*, *React calls Components and Hooks*, and *Rules of
Hooks*. Read this when a bug looks like "works once, wrong on the second render" or when the
linter or compiler complains about a rule you don't recognize. The page states these are rules,
not guidelines: break them and the app likely has bugs. It recommends Strict Mode together with
`eslint-plugin-react-hooks`.

## 1. Components and Hooks must be pure

A pure component or Hook is idempotent, has no side effects in render, and does not mutate
non-local values. Purity is what lets React pause, restart, prioritize, or discard a render
without visible consequences, and what lets the compiler optimize automatically.

### Idempotent

The same props, state, and context must always give the same output; for a Hook, the same
arguments. `new Date()` and `Math.random()` are not idempotent, so they must not run during
render. The docs fix a stuck clock by moving the time into state that an Effect updates:

```tsx skip
function useTime() {
  const [time, setTime] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return time;
}
```

If the value only changes in response to a user action, an event handler is enough.

### Side effects run outside render

Render can happen many times. Side effects belong in event handlers first, and in `useEffect`
only "as a last resort". Quick heuristic from the docs: code at the top level of the component
body runs during render; code inside a handler or an Effect callback does not.

Merely calling a component function must not change the screen. `document.title = product.title`
in the body is a violation; synchronize it in an Effect.

### Which mutation is fine

| Case | Verdict |
| --- | --- |
| A local array built and pushed to inside render | Fine. It is recreated every render and nothing else can see it |
| An array declared at module scope and pushed to in render | Bug. It remembers previous renders and duplicates results |
| Lazy initialization that does not affect other components (`initializeIfNotReady()`) | Fine |
| Writing to the DOM during render | Not allowed |

React does not require 100% functional purity; it requires that calling a component several
times is safe and does not affect other components' rendering.

### Props and state are immutable snapshots

Never `item.url = ...` on a prop. Copy it. Never `count = count + 1` on state, and note that
mutating a state object in place also gives the user a stale UI because React isn't told to
re-render. Pass new props and use the setter.

### Hook arguments and return values are immutable

Once a value goes into a Hook (or comes out of one), don't mutate it. The docs' example copies
`icon` with a spread before adding `className`. Values are also immutable after being passed to
JSX: do the mutation before creating the JSX.

## 2. React calls Components and Hooks

- **Never call a component as a function.** `{Article()}` instead of `<Article />` removes the
  call from React's control. Hooks inside it can then be called conditionally or in loops, local
  state can't attach to a component identity, reconciliation loses the component boundary, and
  the compiler and DevTools lose their view.
- **Never pass a Hook around as a value.** No higher-order Hooks (`withLogging(useData)`), no
  `useData={useDataWithLogging}` props. Hooks should be static so a reader can see everything a
  component does by reading it. Create a new Hook that inlines the logic, and call it directly
  where it's used.
- The docs' guidance for tests that want to swap a Hook or component: mock the server, not React,
  or prefer end-to-end tests.

## 3. Rules of Hooks

Functions starting with `use` are Hooks.

**Only call Hooks at the top level**, before any early return, while React is rendering a
function component or a custom Hook. Not allowed:

- inside conditions or loops
- after a conditional `return`
- inside event handlers
- inside class components
- inside functions passed to `useMemo`, `useReducer`, or `useEffect`
- inside `try`/`catch`/`finally`

**Only call Hooks from React functions**: components and custom Hooks, not ordinary functions.
The point is that all stateful logic of a component is visible in its source.

Custom Hooks may call other Hooks; that is their purpose.

(`use()` from React 19 is an API, not a Hook, and is exempt from the conditional rule. See
`react-19-apis.md`.)

## 4. How the linter and compiler relate

`eslint-plugin-react-hooks` encodes these rules. The compiler's validation passes encode the same
rules and report violations as diagnostics, which the React Compiler 1.0 post says often expose
latent bugs. If a component breaks a rule, the compiler skips it rather than risk changing
behavior. See `react-compiler.md`.

## Quick reference

| Symptom | Rule behind it |
| --- | --- |
| Value is stale or frozen after the first render | Impure render (`new Date()`, module-level mutable) |
| Duplicated list items after re-render | Mutating a value created outside render |
| UI doesn't update after `state.x = 1` | Mutated state instead of calling the setter |
| "Rendered more hooks than during the previous render" | Hook after a condition or early return |
| Child loses state when the parent renders | Component defined inside a component, or called as a function |
