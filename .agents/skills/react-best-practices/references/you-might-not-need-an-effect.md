# You Might Not Need an Effect (digest)

Source: React documentation, https://react.dev/learn/you-might-not-need-an-effect. Read this
before adding any `useEffect`, and when reviewing one. The article's thesis: Effects are an escape
hatch from the React paradigm for synchronizing with external systems. With no external system,
you shouldn't need one, and removing unnecessary Effects makes code easier to follow, faster, and
less error-prone.

## The two cases that never need an Effect

1. **Transforming data for rendering.** An Effect that sets state from other state causes an
   extra render pass: render with the stale value, commit, run the Effect, set state, render
   again. Transform at the top level of the component instead; it reruns automatically.
2. **Handling user events.** By the time an Effect runs you don't know what the user did. The
   event handler does.

You do need Effects to synchronize with external systems: a jQuery widget, the network, the
browser DOM.

## Recipes

### Updating state based on props or state

Don't keep `fullName` in state plus an Effect that joins `firstName` and `lastName`. Compute
`const fullName = firstName + " " + lastName` during render. Rule: when something can be
calculated from existing props or state, don't put it in state.

### Caching expensive calculations

A filter over `todos` is usually fine computed inline. If it is slow, wrap in `useMemo`. The
article notes React Compiler can memoize automatically, removing the need for manual `useMemo`
in many cases. "Expensive" heuristic: unless you loop over thousands of objects it probably isn't;
measure with `console.time`, and treat about 1 ms or more per interaction as worth memoizing.
Test with CPU throttling, in a production build (Strict Mode double-renders in development).
`useMemo` does not make the first render faster.

### Resetting all state when a prop changes

Don't `setComment("")` in an Effect keyed on `userId`: children render once with stale state, and
every stateful descendant needs the same treatment. Split the component and pass the prop as
`key`:

```tsx skip
export default function ProfilePage({ userId }) {
  return <Profile userId={userId} key={userId} />;
}
function Profile({ userId }) {
  const [comment, setComment] = useState("");
}
```

React then treats different keys as different components, recreating the DOM and resetting state
of the component and all its children. Only the outer component is exported; callers pass
`userId` as an ordinary prop and the key is an implementation detail.

### Adjusting some state when a prop changes

Order of preference, best last in the article's own progression:

1. Not an Effect.
2. Adjust during render, guarded by a comparison with the previous value:

```tsx skip
const [prevItems, setPrevItems] = useState(items);
if (items !== prevItems) {
  setPrevItems(items);
  setSelection(null);
}
```

   React discards the JSX and re-renders immediately, before children render or the DOM updates.
   Only the same component's state may be set this way; setting another component's state during
   render errors. The `!==` guard prevents loops. Other side effects stay out of this pattern.
3. Best: don't adjust at all. Store `selectedId`, then
   `const selection = items.find((i) => i.id === selectedId) ?? null`. If the item is still in the
   list it stays selected; otherwise `null`.

The article says even pattern 2 is rarely needed; first check key-reset and derivation.

### Sharing logic between event handlers

An Effect keyed on `product.isInCart` that shows a notification fires again on reload when the
cart was persisted. Ask *why* the code runs: "because the user pressed the button" is an event.
Put shared logic in a plain function (`buyProduct`) called by both handlers. Use Effects only for
code that should run *because the component was displayed*.

### Sending a POST request

Analytics sent because the form was displayed belongs in an Effect (run on mount). The POST sent
because the user submitted belongs in the submit handler.

### Chains of computations

Effects that each set the next piece of state (`card` → `goldCardCount` → `round` → `isGameOver`)
cause a cascade of re-renders and break when you add history navigation, because setting a past
state triggers the chain again. Calculate what you can during render (`isGameOver = round > 5`)
and do all the updates in the event handler. State is a snapshot inside a handler, so compute the
next value manually (`const nextRound = round + 1`) when you need it. The exception the article
gives: a form where each dropdown's options depend on the previous selection and come from the
network; there a chain of Effects is appropriate because you are synchronizing with the network.

### Initializing the application

Logic that must run once per app load, not once per mount, does not belong in a bare
`useEffect(..., [])`. Components must survive remounting (Strict Mode does it in development), and
such an Effect runs twice there and can, for example, invalidate an auth token. Two fixes from the
article: a module-level `let didInit = false` guard inside the Effect, or run it during module
initialization (`if (typeof window !== "undefined") { checkAuthToken(); }`) in the root module.
Top-level code runs when the module is imported even if never rendered, so keep app-wide init in
`App` or the entry point.

### Notifying parent components about state changes

An Effect that calls `onChange(isOn)` after `isOn` changes makes the parent update only after the
child already rendered and committed, so React does another pass. Call `onChange` in the same
event handler that sets state; both updates batch into one pass. Or make the component fully controlled (lift state up)
so the parent owns the value.

### Passing data to the parent

A child that fetches then calls `onFetched(data)` in an Effect inverts data flow and makes bugs
hard to trace. Fetch in the parent and pass the data down.

### Subscribing to an external store

A manual `useEffect` with `addEventListener` and `setState` for `navigator.onLine` works, but
`useSyncExternalStore(subscribe, getSnapshot)` is the built-in for this and handles tearing and
server rendering (a `getServerSnapshot` argument).

### Fetching data

Fetching is a legitimate Effect because you are synchronizing results with the current `query`
and `page`, wherever they came from (a URL the user navigates Back to, for example). The bug is
the missing cleanup: responses can arrive out of order, so a late `"hell"` response overwrites
`"hello"`. Fix with an `ignore` flag in cleanup:

```tsx skip
useEffect(() => {
  let ignore = false;
  fetchResults(query, page).then((json) => {
    if (!ignore) setResults(json);
  });
  return () => { ignore = true; };
}, [query, page]);
```

The article warns that races are only one of the problems. Also consider caching (so Back is
instant), server fetching (initial HTML without a spinner), and avoiding network waterfalls. Those
are not React-specific, and "modern frameworks provide more efficient built-in data fetching
mechanisms than fetching data in Effects." Without a framework, extract the Effect into a custom
`useData(url)` Hook.

## Decision list

| Question | If yes |
| --- | --- |
| Can it be computed from props/state? | Compute during render |
| Is it caused by a specific user action? | Event handler |
| Does it reset state for a different "thing"? | `key` |
| Is it syncing with something outside React while on screen? | Effect, with cleanup |
| Is it a one-time app init? | Module scope |
| Is it subscribing to a store React doesn't own? | `useSyncExternalStore` |
