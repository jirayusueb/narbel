---
name: react-best-practices
description: >-
  Write idiomatic, correct, maintainable React 19 in TypeScript. Use this skill whenever you
  write, review, refactor, debug, or explain React code: function components, props, hooks,
  useState, useReducer, useEffect, useEffectEvent, useMemo, useCallback, refs, context,
  forms, Actions, useActionState, useOptimistic, use(), Suspense, Activity, .tsx files,
  React Compiler, eslint-plugin-react-hooks, or Testing Library tests. Trigger on any mention
  of React, JSX, hooks, "useEffect", re-renders, stale state, infinite loops, or "should this
  be an Effect", even when the user does not ask for best practices. Synthesized from the
  react.dev docs (Rules of React, You Might Not Need an Effect, React 19 and 19.2, React
  Compiler 1.0, Using TypeScript) and the Testing Library guidance.
---

# React best practices

Distilled from the react.dev documentation, with a digest of each source in `references/`.
Targets React 19.2+ with `@types/react` 19.x. Where the sources disagree, this file says
which to follow and why. For bundle size, waterfalls, and rendering performance
tuning, use the separate `vercel-react-best-practices` skill; this one covers correctness
and structure.

## 1. Mindset

- **Render is a pure function of props, state, and context.** Same inputs, same JSX. React may
  call your component twice (Strict Mode does in development), skip a render, or throw one
  away, so anything else done in render is a bug waiting for a schedule change.
- **Derive, don't sync.** If a value can be computed from props and state, compute it during
  render. A second state variable that must "stay in sync" with the first is a bug generator,
  and an Effect that copies one into the other is an extra render pass on top.
- **Effects are an escape hatch to external systems.** Network, DOM APIs, timers, third-party
  widgets, subscriptions. If no external system is involved, you don't need an Effect.
- **Events cause things; rendering shows things.** Run "because the user did X" code in event
  handlers, where you know what happened. Run "because this component is on screen" code in
  Effects.
- **Let the tools do the work.** `tsc` owns types, `eslint-plugin-react-hooks` owns the Rules
  of React, and the React Compiler owns memoization. Spend your attention on state shape and
  component boundaries.

## 2. Before you hand back code

```bash
tsc --noEmit                 # or tsgo; strict mode on
eslint .                     # with eslint-plugin-react-hooks recommended preset
vitest run                   # or your runner; Testing Library, queries by role
```

- Use `eslint-plugin-react-hooks` v6 or later with the `recommended` preset. It enforces the
  Rules of Hooks and `exhaustive-deps`, and carries the compiler-powered rules
  (`set-state-in-render`, `set-state-in-effect`, `refs`). It works without installing the
  compiler.
- **Fix `exhaustive-deps` warnings by changing the code, never by suppressing them.** The
  dependency list describes what the Effect reads; suppressing the rule lies to React about
  that. See section 5.
- Keep `<StrictMode>` on in development. Double render and double Effect setup exist to
  expose impurity and missing cleanup; a "fix" that makes them stop firing hides the bug.
- Do not import React just for JSX (`jsx: react-jsx`). Import the hooks and types you use by
  name, with `import type` for types.

## 3. Components and props

- **Components are PascalCase functions that return JSX; hooks are `useCamelCase` functions.**
  Both names are how the linter and the compiler recognize them.
- **Never call a component as a function and never pass a hook around as a value.** Render
  `<Thing />`; call hooks only from components and other hooks. React must own the call to
  track state. Hooks also can't go in conditions, loops, after an early return, in handlers,
  in `try`/`catch`, or inside `useMemo`/`useEffect` callbacks; they run at the top level, in
  the same order every render.
- **Never define a component inside another component.** Each render creates a new type, so
  React unmounts and remounts the subtree and its state is lost. Hoist it to module scope and
  pass data as props.
- **Prefer composition over boolean props.** `<Card compact outlined withFooter>` grows
  combinations nobody tests. Take `children` and named slots typed `ReactNode`
  (`footer?: ReactNode`) instead.

- **Keys are identity, not an index.** Use a stable ID from the data. Index keys break state
  and focus when the list is reordered or filtered; `Math.random()` keys remount every row on
  every render.
- **Props and state are immutable snapshots.** Never `props.items.push(...)` or
  `state.user.name = ...`. Copy, then set: `setUser({ ...user, name })`. Mutating values
  after passing them to JSX or to a hook is also out; do the mutation first, then use the
  result.
- **Mark props `readonly`** in new code. It documents the rule above and the compiler can
  rely on it.
- **Local mutation is fine.** Building a fresh array with `push` inside render is pure
  because nothing outside can see it. What is forbidden is mutating things that existed
  before render.

## 4. State

**Store the minimum, derive the rest.** Selected item: store the ID, find the item during
render. Filtered list: store the filter, compute the list. This removes the whole category of
"adjust state when props change" code:

```tsx
import { useState } from "react";

interface Todo {
  readonly id: string;
  readonly title: string;
  readonly done: boolean;
}

export function TodoList({ todos }: { readonly todos: readonly Todo[] }) {
  const [hideDone, setHideDone] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const visible = hideDone ? todos.filter((todo) => !todo.done) : todos;
  const selected = todos.find((todo) => todo.id === selectedId) ?? null;

  return (
    <div>
      <label>
        <input
          type="checkbox"
          checked={hideDone}
          onChange={(event) => setHideDone(event.currentTarget.checked)}
        />
        Hide completed
      </label>
      <ul>
        {visible.map((todo) => (
          <li key={todo.id}>
            <button type="button" onClick={() => setSelectedId(todo.id)}>
              {todo.title}
            </button>
          </li>
        ))}
      </ul>
      {selected ? <p>Selected: {selected.title}</p> : null}
    </div>
  );
}
```

**Model mutually exclusive states as a discriminated union, not boolean flags.** Three flags
allow eight combinations and five of them are nonsense (`isLoading && isError`). A union makes
the nonsense unrepresentable and makes TypeScript narrow for you:

```tsx
import { useState } from "react";

type Load<T> =
  | { readonly status: "idle" }
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly message: string }
  | { readonly status: "ready"; readonly data: T };

export function Result({ state }: { readonly state: Load<readonly string[]> }) {
  switch (state.status) {
    case "idle":
      return null;
    case "loading":
      return <p role="status">Loading…</p>;
    case "error":
      return <p role="alert">{state.message}</p>;
    case "ready":
      return (
        <ul>
          {state.data.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      );
  }
}
```

**Reset state with `key`, not an Effect.** When a prop means "this is a different thing", give
the inner component that prop as `key`. React discards the old subtree, state included, with no
stale render:

```tsx
import { useState } from "react";

export function ProfilePage({ userId }: { readonly userId: string }) {
  return <Profile key={userId} userId={userId} />;
}

function Profile({ userId }: { readonly userId: string }) {
  const [comment, setComment] = useState("");
  return (
    <textarea
      aria-label={`Comment on ${userId}`}
      value={comment}
      onChange={(event) => setComment(event.currentTarget.value)}
    />
  );
}
```

Order of preference when a prop change should affect state: (1) derive during render, (2) reset
with `key`, (3) store an ID instead of an object, (4) adjust state during render behind an
`if (prev !== next)` guard. Never (5) an Effect that calls `setState`.

**Pass an updater when the next value depends on the previous one**: `setCount((n) => n + 1)`.
Closures capture the render's value, so `setCount(count + 1)` twice in a handler adds one.

**Lift state to the nearest common parent; colocate everything else.** State that only one
subtree reads lives in that subtree, so typing in one input doesn't re-render the page.

**Use `useReducer` when several fields change together or transitions have names.** Reducers
are pure and testable without rendering:

```tsx
import { useReducer } from "react";

interface State {
  readonly count: number;
  readonly step: number;
}

type Action =
  | { readonly type: "increment" }
  | { readonly type: "setStep"; readonly step: number }
  | { readonly type: "reset" };

const initial: State = { count: 0, step: 1 };

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "increment":
      return { ...state, count: state.count + state.step };
    case "setStep":
      return { ...state, step: action.step };
    case "reset":
      return initial;
  }
}
```

**Context is for values many distant components read and rarely change** (theme, locale,
current user). It is not a general state store: every consumer re-renders when the value
changes. In React 19, render `<Ctx value={...}>` directly; `<Ctx.Provider>` still works but
is slated for deprecation.

## 5. Effects

An Effect synchronizes your component with something outside React while the component is on
screen. Before writing one, ask "what external system, and why does this run?"

### Instead of an Effect, do this

| You want to... | Do this instead |
| --- | --- |
| Compute a value from props or state | Compute it during render |
| Cache an expensive pure computation | Render it plainly; `useMemo` only if profiling shows it matters (or let the Compiler) |
| Reset all state when a prop changes | Pass the prop as `key` to the inner component |
| Adjust part of the state when a prop changes | Store an ID and derive; else a guarded set during render |
| Run code because the user did something (buy, submit, notify) | Put it in the event handler, shared logic in a plain function |
| Tell the parent about a change | Call `onChange` in the same event handler that set the state, or lift the state up |
| Chain `setA` → Effect → `setB` | Compute `b` during render, or do all updates in one handler |
| Subscribe to a browser or third-party store | `useSyncExternalStore` |
| Run one-time app setup (not per mount) | Module scope, or an entry point before `createRoot` |
| Fetch data | A framework loader, Server Component with `use`, or a query library; an Effect with cleanup as the last resort |
| POST on submit | A form Action or an event handler; never an Effect |

### Rules for the Effects that remain

- **Setup and cleanup are a pair, and cleanup must undo setup.** connect/disconnect,
  subscribe/unsubscribe, start/cancel. The test: a user must not be able to tell a single setup
  from setup → cleanup → setup, because Strict Mode does exactly that in development. Don't
  guard with a ref to run "once"; that hides the missing cleanup instead of adding it.
- **Dependencies describe the code; you don't choose them.** Every reactive value (prop,
  state, anything declared in the component body) the Effect reads goes in the array. To
  change the list, change the code: move a constant out of the component, move an object or
  function into the Effect, or split the Effect.
- **One Effect, one process.** Two unrelated syncs in one Effect re-run each other. Split them.
- **Read-then-write with an updater.** If the Effect only needs the previous state to compute
  the next one, call `setMessages((prev) => [...prev, msg])` and drop the dependency.
- **Prefer primitives as dependencies.** Depend on `roomId`, not on an `options` object built
  in render, which is a new identity every time.

### Data fetching has a race condition by default

Responses can arrive out of order. If you must fetch in an Effect, cancel the stale request:

```tsx
import { useEffect, useState } from "react";
import { z } from "zod";

const Results = z.array(z.string());

export function SearchResults({ query }: { readonly query: string }) {
  const [results, setResults] = useState<readonly string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal: controller.signal })
      .then(async (response) => Results.parse(await response.json()))
      .then((data) => {
        setError(null);
        setResults(data);
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setError(cause instanceof Error ? cause.message : "Request failed");
      });
    return () => controller.abort();
  }, [query]);

  if (error) return <p role="alert">{error}</p>;
  return (
    <ul>
      {results.map((result) => (
        <li key={result}>{result}</li>
      ))}
    </ul>
  );
}
```

Cleanup aborts the previous request when `query` changes or the component unmounts, and the
`AbortError` is ignored on purpose. Validate the response at the boundary (`zod` here) rather
than trusting `response.json()`. This still has no caching, no dedupe, and no server render, so
prefer a framework or library for anything beyond a toy.

### `useEffectEvent`: read the latest value without re-syncing

`useEffectEvent` is stable in React 19.2. Use it for logic that is conceptually an event fired
from an Effect (a notification when the connection opens) and reads values that should not
restart the Effect (`theme`):

```tsx
import { useEffect, useEffectEvent } from "react";

interface Connection {
  on(event: "connected", handler: () => void): void;
  connect(): void;
  disconnect(): void;
}

declare function createConnection(roomId: string): Connection;
declare function showNotification(message: string, theme: string): void;

export function ChatRoom({ roomId, theme }: { readonly roomId: string; readonly theme: string }) {
  const onConnected = useEffectEvent(() => {
    showNotification("Connected!", theme);
  });

  useEffect(() => {
    const connection = createConnection(roomId);
    connection.on("connected", () => onConnected());
    connection.connect();
    return () => connection.disconnect();
  }, [roomId]);

  return <h1>{roomId}</h1>;
}
```

- Call an Effect Event only from inside Effects (or other Effect Events) in the same component
  or hook. Don't call it in render, don't pass it as a prop, don't list it in the dependency
  array.
- **Never use it to silence `exhaustive-deps`.** If a value should make the Effect re-run (a
  `pageUrl` you log), keep it as a dependency. An Effect Event is for logic that genuinely
  should not re-trigger.

### `<Activity>` instead of unmounting, when state must survive

`<Activity mode={open ? "visible" : "hidden"}>` hides children with `display: none`, keeps their
state and DOM, destroys their Effects while hidden, and re-creates them on show. Use it for
tabs, sidebars, and back-navigation where the user expects the draft to still be there. It
only has `visible` and `hidden` modes in 19.2. If hidden content must not run an Effect
(a subscription), that is now correct by construction; if it must keep running something,
that thing is not an Effect's job.

## 6. Data and actions (React 19)

**An Action is a function run inside a transition.** React tracks its pending state, reverts
optimistic updates when it settles, surfaces thrown errors to the nearest Error Boundary, and
resets uncontrolled forms after a `<form action={fn}>` submits. Prefer this over hand-rolled
`isPending`/`error` flags.

```tsx
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

declare function renameUser(name: string): Promise<string | null>;

interface FormState {
  readonly error: string | null;
}

async function submit(_previous: FormState, formData: FormData): Promise<FormState> {
  const name = formData.get("name");
  if (typeof name !== "string" || name.trim() === "") {
    return { error: "Name is required" };
  }
  return { error: await renameUser(name) };
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending}>
      {pending ? "Saving…" : "Save"}
    </button>
  );
}

export function RenameForm() {
  const [state, formAction] = useActionState(submit, { error: null });
  return (
    <form action={formAction}>
      <label>
        Name
        <input name="name" required />
      </label>
      <SubmitButton />
      {state.error ? <p role="alert">{state.error}</p> : null}
    </form>
  );
}
```

- `useActionState(action, initialState)` returns `[state, dispatch, isPending]`. The action
  receives the previous state first, then the payload (`FormData` for forms). Calls are
  queued and run in order, so it is not for fire-many-independent-requests.
- `useFormStatus` (from `react-dom`) reads the status of the **parent** `<form>`, so call it in
  a child component such as the submit button. It reports nothing if called in the same
  component that renders the `<form>`.
- Read `FormData` values as `unknown`: `get` returns `FormDataEntryValue | null`. Narrow with
  `typeof ... === "string"` and validate; the client can send anything.

**Optimistic UI: `useOptimistic(value, reducer?)`.** The optimistic value shows only while an
Action is pending, then React converges on the real `value` in one commit. If the Action throws,
the UI falls back to the real value automatically. The setter must be called inside an Action:

```tsx
import { startTransition, useOptimistic, useState } from "react";

declare function saveLike(next: boolean): Promise<boolean>;

export function LikeButton({ initial }: { readonly initial: boolean }) {
  const [liked, setLiked] = useState(initial);
  const [optimisticLiked, setOptimisticLiked] = useOptimistic(liked);

  function toggle() {
    startTransition(async () => {
      setOptimisticLiked(!liked);
      const saved = await saveLike(!liked);
      startTransition(() => setLiked(saved));
    });
  }

  return (
    <button type="button" aria-pressed={optimisticLiked} onClick={toggle}>
      {optimisticLiked ? "Liked" : "Like"}
    </button>
  );
}
```

State updates after an `await` inside an Action need their own `startTransition`, as above.

**Suspense and `use`.** `use(promise)` suspends until the promise resolves; `use(Context)`
reads context and, unlike `useContext`, may be called after an early return or in a branch. The
promise must come from a cache, a loader, or a Server Component: **a promise created during
render of a Client Component is recreated on every render and React warns about it.** `use` is
not a Hook (conditions and loops are fine) but it cannot sit inside `try`/`catch`; catch
rejections with an Error Boundary.

```tsx
import { Suspense, use } from "react";

function Comments({ promise }: { readonly promise: Promise<readonly string[]> }) {
  return <ul>{use(promise).map((comment) => <li key={comment}>{comment}</li>)}</ul>;
}

export function Page({ promise }: { readonly promise: Promise<readonly string[]> }) {
  return (
    <Suspense fallback={<p role="status">Loading comments…</p>}>
      <Comments promise={promise} />
    </Suspense>
  );
}
```

**Server vs Client Components, briefly.** Server Components render ahead of time and can read
data directly; Client Components (`"use client"`) hold state, Effects, and browser APIs. Push
`"use client"` down to the leaves. `"use server"` marks Server Actions, not Server Components
(there is no directive for those). Routing and loaders: follow your framework (Next.js,
TanStack Router) rather than this file.

**Other React 19 changes to use in new code.** `ref` is a regular prop on function components
(no `forwardRef`). `<Ctx value>` replaces `<Ctx.Provider>`. Ref callbacks may return a cleanup
function, which means **a ref callback must not implicitly return a value** (write
`ref={(node) => { el = node; }}`, not `ref={(node) => (el = node)}`). `<title>`, `<meta>` and
`<link>` can be rendered from any component and are hoisted to `<head>`.

## 7. Memoization

| Situation | Do this |
| --- | --- |
| React Compiler is on (new apps from Vite, Next, Expo templates) | Don't write `useMemo`, `useCallback`, or `memo`. The compiler memoizes components and hooks, even after an early return |
| Compiler is on, existing code already has them | Leave them; removing them can change compiler output. Delete only with tests |
| Compiler is on, a value is an Effect dependency and must keep its identity | `useMemo`/`useCallback` as a deliberate escape hatch |
| No compiler, a profiled slow pure calculation (≥ ~1 ms per interaction) | `useMemo` |
| No compiler, a memoized child receives a function or object prop | `memo` on the child and `useCallback`/`useMemo` for the props, together or not at all |
| An expensive function used by many components | Memoize it outside React; the compiler's cache is per component |

- The compiler only helps code that follows the Rules of React. Impure render or mutated props
  make it skip the component (or, rarely, change behavior), so the lint rules matter more with
  it than without.
- Memoization is a performance tool, never a correctness tool. If removing a `useMemo` changes
  what the user sees, the component has an impurity or an Effect with a wrong dependency list.
- The compiler is a build step (Babel plugin, or the framework's integration), not a TypeScript
  feature. Pin `babel-plugin-react-compiler` to an exact version if test coverage is thin,
  because memoization changes can shift Effects that lean on identity.

Where the sources disagree: the older docs say "wrap it in `useMemo` when it's slow"; the
current docs say rely on the compiler for new code and keep manual memoization as a control
knob. This file follows the current docs.

## 8. Refs and DOM

- **A ref is for things React doesn't render**: DOM nodes (focus, scroll, measurement), timer
  IDs, third-party instances. Don't read or write `ref.current` during render, except to
  lazily initialize it; the `refs` lint rule flags this.
- **Don't use a ref to remember something the UI shows.** If a change should repaint, it is
  state.
- **`ref` is a prop in React 19.** Take it in props; no `forwardRef`:

```tsx
import type { Ref } from "react";

interface TextFieldProps {
  readonly label: string;
  readonly ref?: Ref<HTMLInputElement>;
}

export function TextField({ label, ref }: TextFieldProps) {
  return (
    <label>
      {label}
      <input ref={ref} />
    </label>
  );
}
```

- Do imperative DOM work (focus, `scrollIntoView`, `play()`) in event handlers, or in an Effect
  when it must follow a render. Never in render: the node may not exist yet.
- Prefer `useId` for ID pairs (`htmlFor`/`id`) over hand-written strings, so two copies of a
  component don't collide.

## 9. Accessibility essentials

- **Use the semantic element.** `<button type="button">` for actions, `<a href>` for
  navigation, `<ul>`/`<li>` for lists, `<nav>`, `<main>`, `<h1>`–`<h6>` in order. A
  `<div onClick>` has no keyboard, focus, or role behavior; you would have to rebuild all of it.
- **Every control has an accessible name.** A `<label>` wrapping or pointing at the input
  (`htmlFor`/`id`), or `aria-label` for icon-only buttons. A placeholder is not a label.
- **Set `type` on every `<button>`.** The default is `submit`, which submits any surrounding
  form.
- **Manage focus when content moves.** After opening a dialog, move focus in; after closing,
  return it to the trigger. Prefer the native `<dialog>` element.
- **Announce async results** with `role="status"` (polite) or `role="alert"` (urgent), as in the
  examples above.
- **Never remove the focus outline without a visible replacement.**
- ARIA is a repair kit, not a default: a correct native element needs no `role`.

## 10. TypeScript and React typing

- **Type props with an `interface` or `type` and annotate the parameter**; return type is
  inferred. Don't use `React.FC`: it can't express generic components, adds nothing since
  `children` stopped being implicit in `@types/react` 18, and react.dev's TypeScript guide never
  uses it.
- **`children`: use `ReactNode`** (anything renderable). `ReactElement` only when you need an
  actual element, e.g. to clone it. TypeScript can't restrict children to specific tags.
- **Extend native elements with `ComponentProps<"button">`**, not by redeclaring each
  attribute. `ComponentProps` includes `ref` for function components in 19.
- **Events: let inference work inline** (`onChange={(event) => ...}` is already typed). For an
  extracted handler use `React.ChangeEvent<HTMLInputElement>`, or the handler type
  `React.ChangeEventHandler<HTMLInputElement>`. Read `event.currentTarget` (typed as the
  element), not `event.target`.
- **`useState<T | null>(null)`** when the initial value doesn't show the type; a union for a
  closed set; a discriminated union for states with different data (section 4).
- **`useRef<HTMLInputElement>(null)`** for DOM refs. In 19 types `useRef` requires an
  argument.
- **Context with no sensible default**: `createContext<Value | null>(null)` plus a hook that
  throws when it's `null`, so consumers get a non-null type.
- **Generic components are plain generic functions**, which is a reason to avoid `FC`.
- **Don't type a component's return value**; if a function returns `ReactNode` by accident
  (a string), it still works as a component, and the annotation adds noise.
- **Type useCallback parameters** under `strict`; it can't infer them from context.
- Under `exactOptionalPropertyTypes`, `variant?: "a" | "b"` rejects an explicit `undefined`.
  Write `variant?: "a" | "b" | undefined` when callers forward a possibly-undefined value.
- **Validate data from outside with a schema** (`zod`); a type assertion on `response.json()`
  is a promise to the compiler that nothing checks.

```tsx
import type { ComponentProps } from "react";
import { createContext, use } from "react";

type ButtonProps = Omit<ComponentProps<"button">, "type"> & {
  readonly tone?: "neutral" | "danger";
};

export function Button({ tone = "neutral", ...rest }: ButtonProps) {
  return <button type="button" data-tone={tone} {...rest} />;
}

interface ListProps<T> {
  readonly items: readonly T[];
  readonly getKey: (item: T) => string;
  readonly render: (item: T) => React.ReactNode;
}

export function List<T>({ items, getKey, render }: ListProps<T>) {
  return (
    <ul>
      {items.map((item) => (
        <li key={getKey(item)}>{render(item)}</li>
      ))}
    </ul>
  );
}

interface Session {
  readonly userId: string;
}

const SessionContext = createContext<Session | null>(null);

export function useSession(): Session {
  const session = use(SessionContext);
  if (session === null) throw new Error("useSession must be used inside <SessionContext>");
  return session;
}
```

Where the sources disagree: `useCallback<React.ChangeEventHandler<...>>` (react.dev) and an
annotated parameter (`(event: React.ChangeEvent<...>) => ...`) both type-check. Use the
annotated parameter; it reads like normal TypeScript.

## 11. Testing

- **Test behavior through the DOM the user sees**, with React Testing Library plus
  `user-event`. Don't test state variables, hook internals, or implementation details.
- **Query by role first.** Testing Library's priority order: `getByRole` (with `name`) →
  `getByLabelText` → `getByPlaceholderText` → `getByText` → `getByDisplayValue`, then
  `getByAltText`/`getByTitle`, and `getByTestId` last. If you can't find something by role,
  the UI may be inaccessible; fix the UI.
- `getBy*` throws if missing (assert presence), `queryBy*` returns `null` (assert absence),
  `findBy*` awaits (asynchronous appearance). Use `screen`.
- Use `await user.click(...)` (user-event) over `fireEvent`; it models focus and event order.
- Wrap time and network at the boundary (a fake `fetch`, or MSW), not by mocking React.
- A test that fails when you refactor with no behavior change is testing the wrong thing.

```tsx skip
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

test("shows the selected todo", async () => {
  const user = userEvent.setup();
  render(<TodoList todos={[{ id: "1", title: "Write docs", done: false }]} />);

  await user.click(screen.getByRole("button", { name: "Write docs" }));

  expect(screen.getByText("Selected: Write docs")).toBeTruthy();
});
```

## 12. Refactoring someone else's components

Keep behavior; change structure. Go in this order, one change per commit:

1. **Add tests that pin current behavior** if there are none, by role.
2. **Turn on the hooks lint rules** and read what they report; they point at the real bugs.
3. **Delete state that duplicates other state** and the Effect that synced it (section 4).
4. **Delete Effects that only transform data or respond to events** (section 5 table).
5. **Fix the Effects that remain**: cleanup, dependency list matches the code, no suppression.
6. **Replace boolean-flag clusters** with a discriminated union or a reducer.
7. **Move components defined inside components to module scope**; replace index keys.
8. **Replace `forwardRef`, `Context.Provider`, and `React.FC`** with the 19 forms, if the codebase
   is on 19 and the change is mechanical.
9. **Leave existing `useMemo`/`useCallback`/`memo` alone** unless the compiler is on and you
   have tests, or profiling says they're wrong.
10. **Don't restyle unrelated code.** A hook refactor that also renames every prop is
    unreviewable.

When something looks wrong but you can't prove it, say so and ask; React code that "feels
wrong" is sometimes compensating for a framework constraint.

## References

Each digest summarizes one primary source. Read it when weighing alternatives for that topic.

- `references/rules-of-react.md`: https://react.dev/reference/rules (purity, rules of Hooks, React calls components)
- `references/you-might-not-need-an-effect.md`: https://react.dev/learn/you-might-not-need-an-effect
- `references/synchronizing-with-effects.md`: https://react.dev/learn/synchronizing-with-effects
- `references/removing-effect-dependencies.md`: https://react.dev/learn/removing-effect-dependencies and https://react.dev/reference/react/useEffectEvent
- `references/react-19-apis.md`: https://react.dev/blog/2024/12/05/react-19, https://react.dev/blog/2025/10/01/react-19-2, plus the `useActionState`, `useOptimistic`, and `Activity` reference pages
- `references/react-compiler.md`: https://react.dev/learn/react-compiler/introduction and https://react.dev/blog/2025/10/07/react-compiler-1
- `references/typescript-with-react.md`: https://react.dev/learn/typescript, the installed `@types/react` 19.3 declarations, and https://testing-library.com/docs/queries/about
