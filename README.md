# mut-state

`mut-state` is a React state library with a mutable API and selector-based rerender control.

You write updates like this:

```ts
state.set((draft) => {
  draft.todos.push({ id: "1", title: "Ship", done: false });
});
```

No return value, no manual spreading.

## Why `mut-state`

- Mutable update ergonomics (`set(draft => void)`).
- Lightweight runtime (direct in-place updates, no draft/proxy layer).
- Works with `Object`, `Array`, `Map`, and `Set` (including deep nesting).
- Selector subscriptions via `useSyncExternalStoreWithSelector`.
- Fast update path for targeted writes.

## What It Is Good For

- Data-heavy UIs with frequent local updates.
- Graph-like or deeply nested state.
- Apps where selector-level rerender control matters.
- Teams that want immutable-like component boundaries with mutable update syntax.

## When Not To Use It

- If you need Redux-style ecosystem tooling (time travel, middleware ecosystem, etc.).
- If your team strongly prefers strict reducer-only update architecture.
- If you mutate state outside `set(...)` (unsupported, like most state libs).

## Installation

```bash
bun add mut-state
```

## Core API

```ts
interface SourceLike<T> {
  get(): DeepReadonly<T>;
  subscribe(callback: () => void): () => void;
}

interface StateLike<T> extends SourceLike<T> {
  set(updater: (draft: MutableDraft<T>) => void): void;
}
```

### `create(initialState)`

Creates a writable state container.

### `derive(...sources, projector)`

Creates read-only derived state from one or more source states.

### `useStore(state, selector?, isEqual?)`

React hook for subscriptions.

- Without selector: returns full state snapshot and rerenders on each successful `set`.
- With selector: rerenders only when selected value changes (`Object.is` by default).
- Optional custom comparator with `isEqual`.

## How It Works Internally (Simple)

1. `create(...)` stores your mutable state object directly.
2. `set(draft => { ... })` executes your updater on that object.
3. On successful `set`, `mut-state` increments a version and notifies subscribers once.
4. `useStore(...)` subscribes through `useSyncExternalStoreWithSelector`:
   - no selector: rerender on each successful `set`
   - selector: rerender only when selected output changes (`isEqual` / `Object.is`)
5. `derive(...)` subscribes to source states and recomputes only when derived output changes.

This keeps update overhead low while preserving precise selector-based rerender control.

## Quick Start

```tsx
import { create, derive, useStore } from "mut-state";

type TodoFilter = "all" | "done" | "active";

interface Todo {
  done: boolean;
  id: string;
  title: string;
}

interface TodosState {
  filter: TodoFilter;
  todos: Todo[];
}

const todosState = create<TodosState>({
  filter: "all",
  todos: [],
});

const visibleCountState = derive(
  todosState,
  (snapshot) =>
    snapshot.todos.filter((todo) => {
      if (snapshot.filter === "done") return todo.done;
      if (snapshot.filter === "active") return !todo.done;
      return true;
    }).length,
);

function TodoCount() {
  const visibleCount = useStore(visibleCountState);
  return <span>{visibleCount}</span>;
}

function AddTodoButton() {
  return (
    <button
      onClick={() => {
        todosState.set((draft) => {
          draft.todos.push({
            done: false,
            id: crypto.randomUUID(),
            title: "New todo",
          });
        });
      }}
    >
      Add
    </button>
  );
}
```

## React 19 Notes

`mut-state` is built around `useSyncExternalStoreWithSelector`. It works with React 18/19 through `useStore(...)`.

`use(store)` is not the primary API here because `mute` is not modeled as a promise/resource primitive.

## Benchmarks

Run benchmarks:

```bash
bun run bench
```

Current suite includes:

- mutation throughput (`mut-state` vs `immer` vs `mutative` vs native spread)
- selector workload benchmark (affected vs unaffected selectors)
- React graph update+render benchmark (`mut-state`, `zustand`, `redux-toolkit`, `jotai`)

Latest local React graph benchmark snapshot (`500` nodes, `600` subscribers):

- `mut-state`: ~`7,812` ops/s
- `zustand`: ~`6,720` ops/s
- `redux-toolkit`: ~`4,062` ops/s
- `jotai`: ~`682` ops/s

Numbers vary by machine and runtime. Use them as directional results, not absolutes.

## Quality

- Typecheck, test, lint, and formatting are enforced with:

```bash
bun run code-check
```

## Status

Early-stage and fast-moving. API is small by design and may evolve.
