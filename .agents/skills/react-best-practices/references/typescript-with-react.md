# TypeScript with React (digest)

Sources: React documentation "Using TypeScript", https://react.dev/learn/typescript; the
`@types/react` 19.3 declarations installed in this repo (used to check each claim below against
real signatures); and Testing Library "About Queries", https://testing-library.com/docs/queries/about
for the testing section. Read this when typing props, children, events, refs, context, or generic
components, and when deciding about `React.FC`. Statements marked "(this skill)" are the skill's own
rule, derived from the declarations, rather than a quotation of react.dev.

## Setup the docs require

Install `@types/react` and `@types/react-dom`. In `tsconfig.json`: `dom` must be in `lib` (it is by
default when `lib` is unset), and `jsx` must be set to a valid option (`preserve` suffices for
most apps; libraries should read the `jsx` docs). Files containing JSX must be `.tsx`. The docs
sandboxes do not run the typechecker, so use the TypeScript Playground or a full editor.

## Components and props

Type the props parameter, with an inline object type for one or two fields or an `interface`/
`type` object type beyond that. Use union types for a prop that can be one of a few values. The
docs' components are plain functions with an annotated parameter:

```tsx skip
interface MyButtonProps {
  /** The text to display inside the button */
  title: string;
  /** Whether the button can be interacted with */
  disabled: boolean;
}

function MyButton({ title, disabled }: MyButtonProps) {
  return <button disabled={disabled}>{title}</button>;
}
```

### `React.FC` verdict (this skill)

Don't use it. Reasons, from the installed types:

- `type FC<P = {}> = FunctionComponent<P>`, and `FunctionComponent<P>` is a non-generic call
  signature `(props: P): ReactNode | Promise<ReactNode>`. A generic component
  (`function List<T>(props: ListProps<T>)`) cannot be written as `const List: FC<...>` without
  losing the type parameter.
- It adds no `children` (that was removed from the types in `@types/react` 18), which was the
  historical reason to prefer it.
- A plain function with a typed parameter infers its return type and reads like ordinary
  TypeScript. react.dev's TypeScript page never uses `FC`.

## Hooks

- **`useState`** infers from the initial value. Give a type argument when the initial value
  doesn't show the type: `useState<Status>("idle")`, `useState<string | null>(null)`. For
  related fields with different possibilities use a discriminated union:
  `{ status: "idle" } | { status: "loading" } | { status: "success"; data: ... } | { status: "error"; error: Error }`.
  The docs explicitly recommend this over parallel flags.
- **`useReducer`**: type the state interface, a discriminated-union action
  (`{ type: "reset" } | { type: "setCount"; value: number }`), the reducer's parameters and return,
  and let `initialState: State` drive inference of the Hook. A type argument is the more explicit
  alternative. A `default: throw new Error("Unknown action")` is optional if the switch is
  exhaustive.
- **`useContext`**: the value type is inferred from `createContext`. When there is no sensible
  default, create with `createContext<Complex | null>(null)` and make the consumer Hook throw if
  the value is `null`, so callers see a non-null type. The docs render `<ThemeContext value=...>`
  directly (19 style).
- **`useMemo` / `useCallback`**: result type inferred from the function. Under `strict`,
  `useCallback` requires parameter types in the callback; the docs show typing it with a handler
  type: `useCallback<React.ChangeEventHandler<HTMLInputElement>>((event) => {...}, [])`. Both
  notes carry the compiler caveat: the compiler reduces the need for either.
- **`useRef`** (this skill, from the declarations): all three overloads take an initial value, so
  you must pass one. `useRef<HTMLInputElement>(null)` returns `RefObject<HTMLInputElement | null>`.
- **`useActionState`, `useOptimistic`, `use`** (from the declarations):
  - `useActionState<State, Payload>(action: (state: Awaited<State>, payload: Payload) => State | Promise<State>, initialState: Awaited<State>, permalink?)`
    returns `[state, dispatch: (payload: Payload) => void, isPending]`. Without a payload type, the
    overload returns `dispatch: () => void`. The reference warns that if the reducer's return
    type differs from `initialState`, you may need to annotate the state type.
  - `useOptimistic<State>(passthrough)` returns `[State, (action: State | ((pending: State) => State)) => void]`;
    with a reducer, `useOptimistic<State, Action>(passthrough, reducer)`.
  - `use<T>(usable: Usable<T>): T`, where `Usable<T>` is a React promise, a `Context<T>`, or a
    renderer-specific type.
  - `useEffectEvent<T extends Function>(callback: T): T` returns the same signature.

## Children

Two options, both from the docs:

| Type | Accepts |
| --- | --- |
| `React.ReactNode` | Everything renderable: elements, strings, numbers, `null`, arrays, fragments. The default choice |
| `React.ReactElement` | Only JSX elements, not primitives. Use when you need an element (e.g. to clone) |

TypeScript cannot restrict children to certain element types (no "only `<li>`" components).

## Events and styles

- Inline handlers (`onChange={(event) => ...}`) are inferred. An extracted function needs an
  explicit type: `function handleChange(event: React.ChangeEvent<HTMLInputElement>)`. Hover over
  the prop to see the expected type. For events not in the list, `React.SyntheticEvent` is the base
  type.
- Read `event.currentTarget` (typed as the element the handler is on) rather than `event.target`,
  which is any `EventTarget` (this skill; the docs' own examples use `currentTarget`).
- `style` props: `React.CSSProperties`.

## Refs as props and ref callbacks

With `ref` a regular prop in 19, declare it in your props: `ref?: Ref<HTMLInputElement>` and
forward it. The 19 post notes TypeScript now rejects a ref callback that returns anything other
than a cleanup function, so `ref={(node) => (x = node)}` errors; use a block body.

## Native element props

`ComponentProps<"button">` yields the intrinsic element's props (including `ref` for function
components in 19). Compose with `Omit` and intersection to restrict or add. Use it instead of
re-declaring `onClick`, `disabled`, and friends (this skill).

## Strictness interactions (this skill)

The repo's strict profile (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
`noPropertyAccessFromIndexSignature`, `verbatimModuleSyntax`, `erasableSyntaxOnly`) shapes React
code:

- `exactOptionalPropertyTypes`: `foo?: string` rejects explicit `undefined`. Use
  `foo?: string | undefined` when forwarding an optional value through props.
- `noUncheckedIndexedAccess`: `todos[0]` is `Todo | undefined`; use `find`/`at` or narrow.
- `verbatimModuleSyntax`: write `import type { ReactNode } from "react"` for types.
- `erasableSyntaxOnly`: no `enum`, `namespace`, or constructor parameter properties. Use string
  literal unions and `as const` objects.

## Testing (Testing Library)

Query priority from the docs: (1) accessible to everyone: `getByRole` (with `name`),
`getByLabelText`, `getByPlaceholderText`, `getByText`, `getByDisplayValue`; (2) semantic:
`getByAltText`, `getByTitle`; (3) `getByTestId`, only when nothing else fits. `getByRole` is "your
top preference for just about everything"; if you can't reach an element with it, the UI may be
inaccessible. Variants: `getBy` throws if 0 or >1 match, `queryBy` returns `null` for 0 (for
asserting absence), `findBy` returns a Promise that retries up to 1000 ms by default. Use `screen`.
Drive interactions with `user-event` and assert with `jest-dom` matchers.
