import { describe, expect, test } from "bun:test";

import { create } from "../create-state";
import { derive } from "../derive-state";

describe("derive", () => {
  test("recomputes and notifies only when derived output changes", () => {
    const countState = create({ count: 0 });
    const stepState = create({ step: 1 });
    const sumState = derive(
      countState,
      stepState,
      (countValue, stepValue) => countValue.count + stepValue.step,
    );

    let notifyCount = 0;
    const unsubscribe = sumState.subscribe(() => {
      notifyCount += 1;
    });

    countState.set((_draft) => {
      // No mutation.
    });
    stepState.set((_draft) => {
      // No mutation.
    });
    expect(notifyCount).toBe(0);

    countState.set((draft) => {
      draft.count = 1;
    });
    expect(sumState.get()).toBe(2);
    expect(notifyCount).toBe(1);

    stepState.set((draft) => {
      draft.step = 1;
    });
    expect(notifyCount).toBe(1);

    unsubscribe();
  });

  test("is read-only", () => {
    const sourceState = create({ value: 1 });
    const derivedState = derive(
      sourceState,
      (sourceValue) => sourceValue.value,
    );
    expect(() => {
      derivedState.set(() => {
        // Derived state is read-only.
      });
    }).toThrow("read-only");
  });
});
