import { describe, expect, test } from "bun:test";
import { produce as immerProduce } from "immer";
import { create as mutativeCreate } from "mutative";
import { Bench } from "tinybench";

import { create as createState } from "../../src/create-state";

const SMALL_RECORD_SIZE = 100;
const MIDDLE_RECORD_SIZE = 1000;
const LARGE_RECORD_SIZE = 5000;

const buildHeavyRecord = (size: number): Record<string, number> => {
  const record: Record<string, number> = {};
  for (let index = 0; index < size; index += 1) {
    record[`item-${index}`] = index;
  }
  return record;
};

interface NestedState {
  groups: Array<{
    items: Array<{
      value: number;
    }>;
  }>;
}

const buildNestedState = (
  groupCount: number,
  itemsPerGroup: number,
): NestedState => ({
  groups: Array.from({ length: groupCount }, (_unused, groupIndex) => ({
    items: Array.from({ length: itemsPerGroup }, (_unusedItem, itemIndex) => ({
      value: groupIndex + itemIndex,
    })),
  })),
});

const cloneNestedState = (state: NestedState): NestedState => ({
  groups: state.groups.map((group) => ({
    items: group.items.map((item) => ({ value: item.value })),
  })),
});

const updateRecord = (
  draft: Record<string, number>,
  updateKeys: string[],
): void => {
  for (const key of updateKeys) {
    draft[key] = (draft[key] ?? 0) + 1;
  }
};

const updateNestedState = (state: NestedState): void => {
  for (let index = 0; index < 5; index += 1) {
    const group = state.groups[index];
    const firstItem = group?.items.at(0);
    if (!firstItem) continue;
    firstItem.value += 1;
  }
};

const updateNestedStateWithSpread = (state: NestedState): NestedState => {
  const nextGroups = [...state.groups];

  for (let index = 0; index < 5; index += 1) {
    const group = nextGroups[index];
    const firstItem = group?.items.at(0);
    if (!group || !firstItem) continue;

    const nextItems = [...group.items];
    nextItems[0] = { ...firstItem, value: firstItem.value + 1 };
    nextGroups[index] = {
      ...group,
      items: nextItems,
    };
  }

  return {
    ...state,
    groups: nextGroups,
  };
};

interface BenchmarkTask {
  name: string;
  run: () => void;
  verify?: () => void;
}

const runBenchmarkComparison = async (
  label: string,
  tasks: BenchmarkTask[],
  iterations = 120,
): Promise<void> => {
  const bench = new Bench({
    iterations,
    warmupIterations: 24,
  });

  for (const task of tasks) {
    bench.add(task.name, task.run);
  }

  await bench.run();

  for (const task of bench.tasks) {
    const taskResult = task.result as
      | { throughput?: { mean?: number } }
      | undefined;
    expect(taskResult?.throughput?.mean ?? 0).toBeGreaterThan(0);
  }

  for (const task of tasks) {
    if (!task.verify) continue;
    task.verify();
  }

  const table = bench.table();
  expect(table).toHaveLength(tasks.length);
  process.stdout.write(`${label}\n${JSON.stringify(table, null, 2)}\n`);
};

const benchmarkPersistentRecord = async (
  label: string,
  baseRecord: Record<string, number>,
  updateKeys: string[],
): Promise<void> => {
  const muteState = createState({ ...baseRecord });
  let immerState = { ...baseRecord };
  let mutativeState = { ...baseRecord };
  let nativeState = { ...baseRecord };

  await runBenchmarkComparison(label, [
    {
      name: "mute-persistent",
      run: () => {
        muteState.set((draft) => {
          updateRecord(draft, updateKeys);
        });
      },
    },
    {
      name: "immer",
      run: () => {
        immerState = immerProduce(immerState, (draft) => {
          updateRecord(draft, updateKeys);
        });
      },
    },
    {
      name: "mutative",
      run: () => {
        mutativeState = mutativeCreate(mutativeState, (draft) => {
          updateRecord(draft, updateKeys);
        });
      },
    },
    {
      name: "native-spread",
      run: () => {
        const nextState = { ...nativeState };
        updateRecord(nextState, updateKeys);
        nativeState = nextState;
      },
    },
  ]);
};

const benchmarkPersistentNested = async (
  label: string,
  baseState: NestedState,
): Promise<void> => {
  const muteState = createState(cloneNestedState(baseState));
  let immerState = cloneNestedState(baseState);
  let mutativeState = cloneNestedState(baseState);
  let nativeState = cloneNestedState(baseState);

  await runBenchmarkComparison(label, [
    {
      name: "mute-persistent",
      run: () => {
        muteState.set((draft) => {
          updateNestedState(draft);
        });
      },
    },
    {
      name: "immer",
      run: () => {
        immerState = immerProduce(immerState, (draft) => {
          updateNestedState(draft);
        });
      },
    },
    {
      name: "mutative",
      run: () => {
        mutativeState = mutativeCreate(mutativeState, (draft) => {
          updateNestedState(draft);
        });
      },
    },
    {
      name: "native-spread",
      run: () => {
        nativeState = updateNestedStateWithSpread(nativeState);
      },
    },
  ]);
};

interface BenchmarkStore<Value> {
  get: () => Value;
  set: (updater: (draft: Value) => void) => void;
  subscribe: (listener: () => void) => () => void;
}

type ImmutableProducer<Value> = (
  previousState: Value,
  updater: (draft: Value) => void,
) => Value;

const createImmutableStore = <Value>(
  initialState: Value,
  producer: ImmutableProducer<Value>,
): BenchmarkStore<Value> => {
  let currentState = initialState;
  const listeners = new Set<() => void>();

  const notifyListeners = (): void => {
    for (const listener of listeners) listener();
  };

  return {
    get: () => currentState,
    set: (updater) => {
      const nextState = producer(currentState, updater);
      if (Object.is(nextState, currentState)) return;
      currentState = nextState;
      notifyListeners();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
};

interface SelectorCounters {
  affected: number;
  unaffected: number;
}

const attachSelectorWorkload = (
  store: BenchmarkStore<Record<string, number>>,
  updatedKey: string,
  unaffectedKeys: string[],
): {
  counters: SelectorCounters;
  cleanup: () => void;
} => {
  const counters: SelectorCounters = {
    affected: 0,
    unaffected: 0,
  };
  const unsubscribers: Array<() => void> = [];

  const subscribeSelector = (
    selector: (state: Record<string, number>) => number,
    onChange: () => void,
  ): void => {
    let previousSelection = selector(store.get());
    const unsubscribe = store.subscribe(() => {
      const nextSelection = selector(store.get());
      if (Object.is(nextSelection, previousSelection)) return;
      previousSelection = nextSelection;
      onChange();
    });
    unsubscribers.push(unsubscribe);
  };

  subscribeSelector(
    (state) => state[updatedKey] ?? 0,
    () => {
      counters.affected += 1;
    },
  );

  for (const key of unaffectedKeys) {
    subscribeSelector(
      (state) => state[key] ?? 0,
      () => {
        counters.unaffected += 1;
      },
    );
  }

  return {
    counters,
    cleanup: () => {
      for (const unsubscribe of unsubscribers) unsubscribe();
    },
  };
};

const benchmarkSelectorWorkload = async (
  label: string,
  baseRecord: Record<string, number>,
  updateKey: string,
): Promise<void> => {
  const unaffectedKeys = Object.keys(baseRecord)
    .filter((key) => key !== updateKey)
    .slice(0, 200);

  const makeTask = (
    name: string,
    storeFactory: () => BenchmarkStore<Record<string, number>>,
  ): BenchmarkTask => {
    const store = storeFactory();
    const { counters, cleanup } = attachSelectorWorkload(
      store,
      updateKey,
      unaffectedKeys,
    );
    let sink = 0;

    return {
      name,
      run: () => {
        store.set((draft) => {
          draft[updateKey] = (draft[updateKey] ?? 0) + 1;
        });

        sink += store.get()[updateKey] ?? 0;
      },
      verify: () => {
        expect(counters.affected).toBeGreaterThan(0);
        expect(counters.unaffected).toBe(0);
        expect(sink).toBeGreaterThan(0);
        cleanup();
      },
    };
  };

  await runBenchmarkComparison(
    label,
    [
      makeTask("mute-persistent", () => createState({ ...baseRecord })),
      makeTask("immer", () =>
        createImmutableStore({ ...baseRecord }, (previousState, updater) =>
          immerProduce(previousState, updater),
        ),
      ),
      makeTask("mutative", () =>
        createImmutableStore({ ...baseRecord }, (previousState, updater) =>
          mutativeCreate(previousState, updater),
        ),
      ),
      makeTask("native-spread", () =>
        createImmutableStore({ ...baseRecord }, (previousState, updater) => {
          const nextState = { ...previousState };
          updater(nextState);
          return nextState;
        }),
      ),
    ],
    100,
  );
};

describe("mutation benchmark", () => {
  test("persistent-store benchmark: small record", async () => {
    const baseRecord = buildHeavyRecord(SMALL_RECORD_SIZE);
    const updateKeys = Object.keys(baseRecord).slice(0, 10);
    await benchmarkPersistentRecord(
      "persistent small-record (100 keys):",
      baseRecord,
      updateKeys,
    );
  }, 30_000);

  test("persistent-store benchmark: single key in middle", async () => {
    const baseRecord = buildHeavyRecord(MIDDLE_RECORD_SIZE);
    const updateKeys = [`item-${Math.floor(MIDDLE_RECORD_SIZE / 2)}`];
    await benchmarkPersistentRecord(
      "persistent record-single-key (1000 keys, middle update):",
      baseRecord,
      updateKeys,
    );
  }, 30_000);

  test("persistent-store benchmark: large record", async () => {
    const baseRecord = buildHeavyRecord(LARGE_RECORD_SIZE);
    const updateKeys = Object.keys(baseRecord).slice(0, 10);
    await benchmarkPersistentRecord(
      "persistent large-record (5000 keys):",
      baseRecord,
      updateKeys,
    );
  }, 30_000);

  test("persistent-store benchmark: nested state", async () => {
    const nestedState = buildNestedState(100, 50);
    await benchmarkPersistentNested(
      "persistent nested-state (100x50):",
      nestedState,
    );
  }, 30_000);

  test("selector workload benchmark (201 subscribers)", async () => {
    const baseRecord = buildHeavyRecord(MIDDLE_RECORD_SIZE);
    const updateKey = `item-${Math.floor(MIDDLE_RECORD_SIZE / 2)}`;
    await benchmarkSelectorWorkload(
      "selector workload (1000 keys, 1 affected + 200 unaffected selectors):",
      baseRecord,
      updateKey,
    );
  }, 30_000);
});
