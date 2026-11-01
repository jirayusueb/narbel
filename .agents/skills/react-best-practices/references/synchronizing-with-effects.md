# Synchronizing with Effects (digest)

Source: React documentation, https://react.dev/learn/synchronizing-with-effects. Read this when
writing an Effect's setup and cleanup, or when explaining why an Effect "runs twice". It defines
what an Effect is, how to write one in three steps, and how to answer the development double-run.

## What an Effect is

Two kinds of logic live in a component:

- **Rendering code**, at the top level. Takes props and state, returns JSX. Must be pure; it
  only calculates.
- **Event handlers**, nested functions that do things: update an input, POST a purchase,
  navigate. Their side effects are caused by one specific user action.

An **Effect** is a side effect caused by *rendering itself* rather than by a particular event.
Sending a chat message is an event. Connecting to the chat server because `ChatRoom` is on screen
is an Effect, because it must happen however the component got there. Effects run at the end of a
commit, after the screen updates, which is the right time to synchronize with the network or a
third-party library. Capital "Effect" means this React concept; "side effect" is the broad
programming term.

Typical use: DOM APIs, widgets, network, subscriptions, timers. If an Effect only sets state from
other state, see `you-might-not-need-an-effect.md`.

## Writing an Effect in three steps

1. **Declare it.** With no dependency array it runs after every commit. Touching a DOM node
   (`ref.current.play()`) during render is wrong: it breaks purity, and on the first render the
   node doesn't exist yet.
2. **Specify dependencies.** Without them, typing in an unrelated input re-runs the Effect.
3. **Add cleanup** if the setup needs undoing: connect/disconnect, subscribe/unsubscribe,
   fetch/abort-or-ignore.

```tsx skip
useEffect(() => {
  const connection = createConnection(serverUrl, roomId);
  connection.connect();
  return () => connection.disconnect();
}, [roomId]);
```

### Dependency array semantics

| Array | Runs |
| --- | --- |
| omitted | After every commit |
| `[]` | After mount only (plus cleanup on unmount). Valid only if the Effect reads no reactive value |
| `[a, b]` | After mount and whenever `a` or `b` differs by `Object.is` |

An Effect with no array that sets state is an infinite loop: render triggers the Effect, the
Effect sets state, which triggers a render. The linter reports a missing dependency when you write
`[]` but the Effect reads `isPlaying`; follow it. See `removing-effect-dependencies.md`.

### Cleanup timing

React runs the cleanup before each re-run of the Effect (with the old values) and once more on
unmount.

## The development double run

In development, React remounts every component once right after its first mount. For the chat
example with `[]` and no cleanup, you see `Connecting...` twice and the second connection leaks:
that is the bug the remount exists to reveal (the user navigates away and back and connections
pile up). With cleanup, development logs connect, disconnect, connect, which is what a navigation
away and back would do.

Rules the article states:

- **The question is not "how do I run this once" but "how do I make this work after
  remounting."**
- The rule of thumb: a user must not be able to distinguish a single run (production) from
  setup → cleanup → setup (development).
- Production runs it once. You can turn Strict Mode off, but the article recommends keeping it.
- **Don't guard with a ref** (`if (!connectionRef.current) {...}`). It prints one log but the
  connection is still never closed when the user leaves, so the bug is hidden, not fixed.

## Cleanup patterns

| Pattern | Setup | Cleanup | Note |
| --- | --- | --- | --- |
| Non-React widget | `map.setZoomLevel(zoomLevel)` | none needed | Calling twice with the same value does nothing |
| Non-idempotent API | `dialog.showModal()` | `dialog.close()` | `showModal` throws if called twice |
| Event subscription | `addEventListener("scroll", handler)` | `removeEventListener` with the same handler | |
| Animation | `node.style.opacity = "1"` | reset to `"0"` | Tweening libraries: reset the timeline |
| Fetching | start the request | abort it or set `ignore = true` | See below |
| Analytics | `logVisit(url)` | none | Keep as is; double logging in development is harmless and shouldn't be "fixed" |

### Fetching

You can't undo a request that already went out; cleanup makes sure an irrelevant response doesn't
affect the app. If `userId` goes from Alice to Bob, the Alice response is ignored even if it
arrives later:

```tsx skip
useEffect(() => {
  let ignore = false;
  async function startFetching() {
    const json = await fetchTodos(userId);
    if (!ignore) setTodos(json);
  }
  startFetching();
  return () => { ignore = true; };
}, [userId]);
```

Two requests appear in development and one in production. If that bothers you, use a solution
that dedupes and caches. The article's deep dive lists the downsides of raw Effect fetching:

- Effects don't run on the server, so initial HTML contains only a loading state.
- Effects make network waterfalls easy (parent fetches, renders child, child fetches).
- No preloading or caching, so unmount then mount refetches.
- Boilerplate to avoid race conditions.

Recommended order: a framework's built-in data fetching, then a client cache (TanStack Query, SWR,
React Router 6.4+), then your own Effect with request dedupe, caching and waterfall avoidance. The
article concedes you may continue fetching in Effects if none of those fit.

## Things that are not Effects

- **App initialization.** Run at module level, behind `typeof window !== "undefined"`, so it
  executes once per page load.
- **Buying a product.** A POST in a mount Effect would fire twice in development and again on a
  Back navigation. Buying is caused by clicking, so it belongs in the click handler. If remounting
  breaks your logic, the article says this usually reveals an existing bug: visiting a page must
  not differ from visiting, leaving, and coming back.

## One Effect, one synchronization process

The article's closing playground makes the point that each Effect represents a separate
synchronization process. Don't merge unrelated ones to save lines; split them so each has its own
setup, cleanup and dependency list.

## Checklist

| Check | Pass condition |
| --- | --- |
| Is an external system involved? | If not, delete the Effect |
| Does cleanup undo setup? | Setup → cleanup → setup looks identical to one setup |
| Does the dependency list match the code? | Linter clean, no suppressions |
| Does anything fire a user-visible duplicate? | If yes, it is an event, not an Effect |
