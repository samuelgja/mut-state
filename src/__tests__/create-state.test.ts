import { describe, expect, test } from "bun:test";

import { create } from "../create-state";

describe("create", () => {
  test("mutates nested object/array/map/set in place", () => {
    const key = { id: "key" };
    const state = create({
      map: new Map([[key, { count: 1 }]]),
      nested: {
        list: [1, 2],
        set: new Set(["a"]),
      },
    });

    const previous = state.get();

    state.set((draft) => {
      draft.nested.list.push(3);
      draft.nested.set.add("b");
      const mapped = draft.map.get(key);
      if (!mapped) throw new Error("missing map value");
      mapped.count += 1;
    });

    const next = state.get();
    expect(next).toBe(previous);
    expect(next.nested).toBe(previous.nested);
    expect(next.nested.list).toBe(previous.nested.list);
    expect(next.nested.set).toBe(previous.nested.set);
    expect(next.map).toBe(previous.map);
    expect(next.nested.list).toEqual([1, 2, 3]);
    expect(next.nested.set.has("b")).toBe(true);
    expect(next.map.get(key)?.count).toBe(2);
  });

  test("notifies on every successful set, including no-op updater", () => {
    const state = create({ value: 1 });
    let notifyCount = 0;
    const unsubscribe = state.subscribe(() => {
      notifyCount += 1;
    });

    state.set((_draft) => {
      // no-op still commits
    });
    state.set((draft) => {
      draft.value = 2;
    });

    unsubscribe();
    expect(notifyCount).toBe(2);
    expect(state.get().value).toBe(2);
  });

  test("does not notify after unsubscribe", () => {
    const state = create({ value: 0 });
    let notifyCount = 0;

    const unsubscribe = state.subscribe(() => {
      notifyCount += 1;
    });

    state.set((draft) => {
      draft.value = 1;
    });
    unsubscribe();
    state.set((draft) => {
      draft.value = 2;
    });

    expect(notifyCount).toBe(1);
    expect(state.get().value).toBe(2);
  });

  test("supports array roots", () => {
    const state = create([1, 2, 3]);

    state.set((draft) => {
      draft.splice(1, 1);
      draft.push(4);
    });

    expect(state.get()).toEqual([1, 3, 4]);
  });

  test("supports map roots", () => {
    const state = create(new Map<string, number>([["a", 1]]));

    state.set((draft) => {
      draft.set("a", 2);
      draft.set("b", 3);
    });

    expect(state.get().get("a")).toBe(2);
    expect(state.get().get("b")).toBe(3);
  });

  test("supports set roots", () => {
    const state = create(new Set(["a"]));

    state.set((draft) => {
      draft.add("b");
      draft.delete("a");
    });

    expect(state.get().has("a")).toBe(false);
    expect(state.get().has("b")).toBe(true);
  });

  test("throws updater errors and does not notify", () => {
    const state = create({ value: 0 });
    let notifyCount = 0;

    state.subscribe(() => {
      notifyCount += 1;
    });

    expect(() => {
      state.set(() => {
        throw new Error("boom");
      });
    }).toThrow("boom");

    expect(notifyCount).toBe(0);

    state.set((draft) => {
      draft.value = 1;
    });
    expect(state.get().value).toBe(1);
  });

  test("throws for non-object roots", () => {
    expect(() => {
      create(42);
    }).toThrow("requires object, array, map, or set");
  });
});
