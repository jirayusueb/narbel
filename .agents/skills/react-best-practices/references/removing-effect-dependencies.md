# Removing Effect Dependencies (digest)

Sources: React documentation, https://react.dev/learn/removing-effect-dependencies, and the
reference page https://react.dev/reference/react/useEffectEvent (stable in React 19.2). Read this
when the linter wants a dependency you don't want, when an Effect re-runs too often, or when you
are about to type `// eslint-disable-next-line react-hooks/exhaustive-deps`.

## The core rule

**Dependencies match the code; you don't choose them.** Every reactive value the Effect reads
(props, state, and any variable or function declared in the component body) must be listed. The
list *describes* the code. To change the list, change the code, in this loop:

1. Change the Effect or how its values are declared.
2. Follow the linter and make the list match.
3. Not happy with the list? Go back to step 1.

To remove a dependency, "prove" to the linter it isn't one: move `roomId` to module scope and it
is no longer reactive, so `[]` is now correct (the Effect really does not depend on anything).

## Never suppress the linter

Suppressing the rule "lies" to React about what the Effect depends on, and "there is a very high
risk of introducing bugs." The article's example: a `setInterval(onTick, 1000)` with `[]` and a
suppression keeps the `onTick` from the first render forever, where `count` was `0` and
`increment` was `1`, so the counter is stuck adding 1 to 0. Recommendation: treat the dependency
lint error as a compilation error. The fix is `onTick` as an Effect Event.

## Decision questions

Walk these in order when a dependency looks unwanted.

### 1. Should this code move to an event handler?

An Effect that fires `post("/api/register")` and `showNotification(...)` when `submitted` becomes
true is event logic. Adding `theme` to read the notification style then re-sends the notification
whenever the theme changes. Put the code in `handleSubmit` instead; handlers are not reactive and
run only on submit.

### 2. Is the Effect doing several unrelated things?

Fetching cities by `country` and areas by `city` in one Effect makes each re-fetch when the other
changes. Split into two Effects, one per synchronization process (each with its own
`ignore`-flag cleanup), each with the dependencies it actually reads.

### 3. Are you reading state to calculate the next state?

If the Effect only needs `messages` to append a new message, use the updater form:

```tsx skip
connection.on("message", (received) => {
  setMessages((msgs) => [...msgs, received]);
});
```

The Effect no longer reads `messages`, drops it from the list, and receiving a message no longer
reconnects the chat.

### 4. Do you want to read a value without reacting to it?

Playing a sound for each new message unless `isMuted` is true should not reconnect when `isMuted`
toggles. Use an Effect Event:

```tsx skip
const onMessage = useEffectEvent((message) => {
  if (!isMuted) playSound();
  setMessages((msgs) => [...msgs, message]);
});

useEffect(() => {
  const connection = createConnection(serverUrl, roomId);
  connection.on("message", onMessage);
  connection.connect();
  return () => connection.disconnect();
}, [roomId]);
```

`useEffectEvent(callback)` returns a function that always sees the latest committed props and
state, and is excluded from dependencies.

Constraints from the reference page:

- Call it at the top level of a component or custom Hook, not in loops or conditions. If you
  need that, extract a component.
- Call the returned function only from Effects (`useEffect`, `useLayoutEffect`,
  `useInsertionEffect`) or other Effect Events in the same component. Not in render. Not passed
  to other components or Hooks. The linter enforces this.
- Its identity changes on every render **on purpose**, so it can't be a dependency. That works as
  a runtime assertion: if your code depends on its identity, the Effect re-runs every render and
  the bug is obvious.
- **Do not use it to skip dependencies.** `const logVisit = useEffectEvent(() => log(pageUrl));`
  then `useEffect(() => logVisit(), [])` misses logs when `pageUrl` changes. If a value should
  re-run the Effect, keep it as a dependency. Use it only for logic that is genuinely an event
  fired from an Effect.
- Use `eslint-plugin-react-hooks@latest` so the linter doesn't try to insert Effect Events as
  dependencies (the 19.2 post notes this).

Typical uses from the reference: timers (`setInterval` calling an Effect Event that reads the
latest `count` and `increment`), event listeners reading `canMove`, notifications after a
connection opens.

### 5. Does a reactive value change unintentionally?

This affects **objects and functions only**: each new object or function is distinct even when its
contents are equal. An `options = { serverUrl, roomId }` built in the body is a new identity every
render, so listing `options` re-synchronizes on every keystroke. Prefer to avoid objects and
functions as dependencies. Options, in the article's order:

| Technique | When |
| --- | --- |
| Move the object or function **outside the component** | It doesn't use props or state |
| Move it **inside the Effect** | It is only used there; the dependency becomes its primitive inputs (`roomId`) |
| **Read primitives** out of an object prop (`const { roomId, serverUrl } = options`) | A parent passes a freshly created object each render |

The reference page for `useActionState` adds that `dispatchAction` has a stable identity, so
including or omitting it is harmless; the same holds for `set` functions from `useState` and for
refs. If the linter lets you omit a value, omitting is safe.

## Quick reference

| Symptom | Likely fix |
| --- | --- |
| Effect re-runs whenever a theme or setting changes | Effect Event for that value, or move to an event handler |
| Effect re-runs every render | An object or function dependency created in render; move or extract primitives |
| Effect uses a stale value | Missing dependency (suppressed linter); fix the list, or Effect Event if it's event logic |
| Two unrelated syncs in one Effect | Split into two Effects |
| `setState(x + 1)` in an Effect needs `x` | Updater form `setX((x) => x + 1)` |
| Wanting `[]` "to run once" | Not a goal; make the Effect correct after remounting |
