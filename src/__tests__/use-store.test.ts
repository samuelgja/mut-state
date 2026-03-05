import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import { act } from "react";
import React from "react";

import { create } from "../create-state";
import { derive } from "../derive-state";
import type { MutableDraft, StateLike } from "../mute.types";
import { useStore } from "../use-store";

describe("useStore", () => {
  afterEach(() => {
    cleanup();
  });

  test("rerenders on every successful set when selector is omitted", async () => {
    const state = create({
      count: 0,
      nested: { flag: false },
    });

    const renderHistory: string[] = [];
    const Counter = (): React.ReactElement => {
      const snapshot = useStore(state);
      const renderValue = `${snapshot.count}:${String(snapshot.nested.flag)}`;
      renderHistory.push(renderValue);
      return React.createElement(
        "span",
        { "data-testid": "full-snapshot" },
        renderValue,
      );
    };

    render(React.createElement(Counter));
    expect(renderHistory).toEqual(["0:false"]);

    await act(async () => {
      state.set((draft) => {
        draft.nested.flag = true;
      });
    });
    expect(renderHistory).toEqual(["0:false", "0:true"]);
    expect(screen.getByTestId("full-snapshot").textContent).toBe("0:true");

    await act(async () => {
      state.set((_draft) => {
        // No mutation.
      });
    });
    expect(renderHistory).toEqual(["0:false", "0:true", "0:true"]);
    expect(screen.getByTestId("full-snapshot").textContent).toBe("0:true");

    await act(async () => {
      state.set((draft) => {
        draft.count = 1;
      });
    });
    expect(renderHistory).toEqual(["0:false", "0:true", "0:true", "1:true"]);
    expect(screen.getByTestId("full-snapshot").textContent).toBe("1:true");
  });

  test("rerenders only when selected slice changes", async () => {
    const state = create({
      count: 0,
      nested: { flag: false },
    });

    const renderHistory: number[] = [];
    const Counter = (): React.ReactElement => {
      const count = useStore(state, (snapshot) => snapshot.count);
      renderHistory.push(count);
      return React.createElement(
        "span",
        { "data-testid": "counter-value" },
        count,
      );
    };

    render(React.createElement(Counter));
    expect(renderHistory).toEqual([0]);
    expect(screen.getByTestId("counter-value").textContent).toBe("0");

    await act(async () => {
      state.set((draft) => {
        draft.nested.flag = true;
      });
    });
    expect(renderHistory).toEqual([0]);
    expect(screen.getByTestId("counter-value").textContent).toBe("0");

    await act(async () => {
      state.set((draft) => {
        draft.count = 1;
      });
    });
    expect(renderHistory).toEqual([0, 1]);
    expect(screen.getByTestId("counter-value").textContent).toBe("1");
  });

  test("keeps large-record selectors stable for unrelated updates", async () => {
    const itemCount = 2000;
    const targetIndex = Math.floor(itemCount / 2);
    const unrelatedIndex = targetIndex + 1;
    const targetKey = `item-${targetIndex}`;
    const unrelatedKey = `item-${unrelatedIndex}`;
    const items: Record<string, number> = {};
    for (let index = 0; index < itemCount; index += 1) {
      items[`item-${index}`] = index;
    }

    const state = create({
      items,
    });

    const renderHistory: number[] = [];
    const TargetView = (): React.ReactElement => {
      const value = useStore(
        state,
        (snapshot) => snapshot.items[targetKey] ?? -1,
      );
      renderHistory.push(value);
      return React.createElement(
        "span",
        { "data-testid": "large-target" },
        value,
      );
    };

    render(React.createElement(TargetView));
    expect(renderHistory).toEqual([targetIndex]);
    expect(screen.getByTestId("large-target").textContent).toBe(
      String(targetIndex),
    );

    await act(async () => {
      for (let run = 0; run < 100; run += 1) {
        state.set((draft) => {
          draft.items[unrelatedKey] = (draft.items[unrelatedKey] ?? 0) + 1;
        });
      }
    });

    expect(renderHistory).toEqual([targetIndex]);
    expect(screen.getByTestId("large-target").textContent).toBe(
      String(targetIndex),
    );

    await act(async () => {
      state.set((draft) => {
        draft.items[targetKey] = (draft.items[targetKey] ?? 0) + 1;
      });
    });

    expect(renderHistory).toEqual([targetIndex, targetIndex + 1]);
    expect(screen.getByTestId("large-target").textContent).toBe(
      String(targetIndex + 1),
    );
  });

  test("isolates rerenders across sibling selector subscriptions", async () => {
    const state = create({
      count: 0,
      nested: { flag: false },
    });

    const countRenderHistory: number[] = [];
    const flagRenderHistory: boolean[] = [];

    const CountView = (): React.ReactElement => {
      const count = useStore(state, (snapshot) => snapshot.count);
      countRenderHistory.push(count);
      return React.createElement("span", { "data-testid": "count" }, count);
    };

    const FlagView = (): React.ReactElement => {
      const flag = useStore(state, (snapshot) => snapshot.nested.flag);
      flagRenderHistory.push(flag);
      return React.createElement(
        "span",
        { "data-testid": "flag" },
        String(flag),
      );
    };

    const App = (): React.ReactElement =>
      React.createElement(
        React.Fragment,
        null,
        React.createElement(CountView),
        React.createElement(FlagView),
      );

    render(React.createElement(App));
    expect(countRenderHistory).toEqual([0]);
    expect(flagRenderHistory).toEqual([false]);

    await act(async () => {
      state.set((draft) => {
        draft.count = 1;
      });
    });
    expect(countRenderHistory).toEqual([0, 1]);
    expect(flagRenderHistory).toEqual([false]);

    await act(async () => {
      state.set((draft) => {
        draft.nested.flag = true;
      });
    });
    expect(countRenderHistory).toEqual([0, 1]);
    expect(flagRenderHistory).toEqual([false, true]);
    expect(screen.getByTestId("count").textContent).toBe("1");
    expect(screen.getByTestId("flag").textContent).toBe("true");
  });

  test("respects custom isEqual comparator", async () => {
    const state = create({ value: 1 });
    const renderHistory: number[] = [];

    const ValueComponent = (): React.ReactElement => {
      const selected = useStore(
        state,
        (snapshot) => ({ value: snapshot.value }),
        () => true,
      );
      renderHistory.push(selected.value);
      return React.createElement(
        "span",
        { "data-testid": "value" },
        selected.value,
      );
    };

    render(React.createElement(ValueComponent));
    expect(renderHistory).toEqual([1]);
    expect(screen.getByTestId("value").textContent).toBe("1");

    await act(async () => {
      state.set((draft) => {
        draft.value = 2;
      });
    });
    expect(renderHistory).toEqual([1]);
    expect(screen.getByTestId("value").textContent).toBe("1");
  });

  test("supports derived state from multiple source states in React", async () => {
    const countState = create({ count: 0 });
    const stepState = create({ step: 1 });
    const bonusState = create({ bonus: 10 });

    const combinedState = derive(
      countState,
      stepState,
      bonusState,
      (countValue, stepValue, bonusValue) => ({
        bonus: bonusValue.bonus,
        count: countValue.count,
        step: stepValue.step,
        total: countValue.count + stepValue.step + bonusValue.bonus,
      }),
    );

    const countRenderHistory: number[] = [];
    const totalRenderHistory: number[] = [];

    const CountView = (): React.ReactElement => {
      const count = useStore(combinedState, (snapshot) => snapshot.count);
      countRenderHistory.push(count);
      return React.createElement(
        "span",
        { "data-testid": "derived-count" },
        count,
      );
    };

    const TotalView = (): React.ReactElement => {
      const total = useStore(combinedState, (snapshot) => snapshot.total);
      totalRenderHistory.push(total);
      return React.createElement(
        "span",
        { "data-testid": "derived-total" },
        total,
      );
    };

    const App = (): React.ReactElement =>
      React.createElement(
        React.Fragment,
        null,
        React.createElement(CountView),
        React.createElement(TotalView),
      );

    render(React.createElement(App));
    expect(countRenderHistory).toEqual([0]);
    expect(totalRenderHistory).toEqual([11]);

    await act(async () => {
      stepState.set((draft) => {
        draft.step = 2;
      });
    });
    expect(countRenderHistory).toEqual([0]);
    expect(totalRenderHistory).toEqual([11, 12]);

    await act(async () => {
      countState.set((draft) => {
        draft.count = 1;
      });
    });
    expect(countRenderHistory).toEqual([0, 1]);
    expect(totalRenderHistory).toEqual([11, 12, 13]);
    expect(screen.getByTestId("derived-count").textContent).toBe("1");
    expect(screen.getByTestId("derived-total").textContent).toBe("13");
  });

  test("supports plain state-like stores without internal snapshot symbol", async () => {
    interface PlainValue {
      count: number;
    }

    let currentState: PlainValue = { count: 0 };
    const listeners = new Set<() => void>();
    const emit = (): void => {
      for (const listener of listeners) listener();
    };

    const plainState: StateLike<PlainValue> = {
      get: () => currentState,
      set: (updater) => {
        const nextState: PlainValue = { ...currentState };
        updater(nextState as MutableDraft<PlainValue>);
        currentState = nextState;
        emit();
      },
      subscribe: (listener) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    };

    const renderHistory: number[] = [];
    const PlainCounter = (): React.ReactElement => {
      const count = useStore(plainState, (snapshot) => snapshot.count);
      renderHistory.push(count);
      return React.createElement(
        "span",
        { "data-testid": "plain-count" },
        count,
      );
    };

    render(React.createElement(PlainCounter));
    expect(renderHistory).toEqual([0]);

    await act(async () => {
      emit();
    });
    expect(renderHistory).toEqual([0]);

    await act(async () => {
      plainState.set((draft) => {
        draft.count = 1;
      });
    });
    expect(renderHistory).toEqual([0, 1]);
    expect(screen.getByTestId("plain-count").textContent).toBe("1");
  });

  test("handles selector mode switches on the same hook instance", async () => {
    type CounterSnapshot = {
      count: number;
      other: number;
    };

    const state = create<CounterSnapshot>({
      count: 0,
      other: 0,
    });

    const renderHistory: string[] = [];
    type Mode = "full" | "selected";

    const ModeView = ({ mode }: { mode: Mode }): React.ReactElement => {
      const selector:
        | ((snapshot: CounterSnapshot) => CounterSnapshot | number)
        | undefined =
        mode === "full"
          ? undefined
          : (snapshot: CounterSnapshot): number => snapshot.count;

      const selected = useStore<CounterSnapshot, CounterSnapshot | number>(
        state,
        selector,
      );

      const text =
        mode === "full"
          ? `full:${(selected as CounterSnapshot).count}`
          : `selected:${selected as number}`;

      renderHistory.push(text);
      return React.createElement("span", { "data-testid": "mode-view" }, text);
    };

    const { rerender } = render(
      React.createElement(ModeView, { mode: "full" }),
    );
    expect(screen.getByTestId("mode-view").textContent).toBe("full:0");

    await act(async () => {
      state.set((draft) => {
        draft.count = 1;
      });
    });
    expect(screen.getByTestId("mode-view").textContent).toBe("full:1");

    rerender(React.createElement(ModeView, { mode: "selected" }));
    expect(screen.getByTestId("mode-view").textContent).toBe("selected:1");

    await act(async () => {
      state.set((draft) => {
        draft.other = 9;
      });
    });
    expect(screen.getByTestId("mode-view").textContent).toBe("selected:1");
    expect(renderHistory).toContain("selected:1");
  });
});
