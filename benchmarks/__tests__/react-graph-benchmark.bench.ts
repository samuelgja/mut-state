import { configureStore, createSlice } from "@reduxjs/toolkit";
import { describe, expect, test } from "bun:test";
import { render } from "@testing-library/react";
import {
  atom,
  type Atom,
  Provider as JotaiProvider,
  useAtomValue,
} from "jotai";
import { createStore as createJotaiStore } from "jotai/vanilla";
import { selectAtom } from "jotai/utils";
import { act } from "react";
import React from "react";
import { Provider as ReduxProvider, useSelector } from "react-redux";
import { Bench } from "tinybench";
import { create as createZustand } from "zustand";

import { create as createMute } from "../../src/create-state";
import { useStore as useMuteStore } from "../../src/use-store";

const GRAPH_NODE_COUNT = 500;
const SUBSCRIBER_COUNT = 600;
interface GraphNode {
  edges: number[];
  meta: {
    active: boolean;
    weight: number;
  };
  value: number;
}

type GraphRecord = Record<string, GraphNode>;

const buildGraphRecord = (size: number): GraphRecord => {
  const graph: GraphRecord = {};
  for (let index = 0; index < size; index += 1) {
    graph[`node-${index}`] = {
      edges: [(index + 1) % size, (index + 13) % size, (index + 97) % size],
      meta: {
        active: index % 2 === 0,
        weight: index % 7,
      },
      value: index,
    };
  }
  return graph;
};

const cloneGraphRecord = (source: GraphRecord): GraphRecord => {
  const clone: GraphRecord = {};
  for (const [nodeId, nodeValue] of Object.entries(source)) {
    clone[nodeId] = {
      edges: [...nodeValue.edges],
      meta: {
        active: nodeValue.meta.active,
        weight: nodeValue.meta.weight,
      },
      value: nodeValue.value,
    };
  }
  return clone;
};

const buildSubscriberIds = (
  nodeCount: number,
  subscriberCount: number,
  targetId: string,
): string[] => {
  const uniqueIds = new Set<string>([targetId]);
  const stride = Math.max(1, Math.floor(nodeCount / subscriberCount));

  for (let index = 0; index < nodeCount; index += stride) {
    uniqueIds.add(`node-${index}`);
    if (uniqueIds.size >= subscriberCount) break;
  }

  let index = 0;
  while (uniqueIds.size < subscriberCount) {
    uniqueIds.add(`node-${index}`);
    index += 1;
  }

  return [...uniqueIds];
};

interface GraphBenchmarkHarness {
  dispose: () => void;
  name: string;
  update: () => number;
  verify: () => void;
}

interface RenderHarnessConfig {
  name: string;
  performUpdate: () => void;
  readTargetValue: () => number;
  renderWithProviders: (child: React.ReactElement) => React.ReactElement;
  subscriberIds: string[];
  targetId: string;
  useNodeValue: (nodeId: string) => number;
}

const incrementRenderCount = (
  renderCounts: Map<string, number>,
  nodeId: string,
): void => {
  renderCounts.set(nodeId, (renderCounts.get(nodeId) ?? 0) + 1);
};

const createReactGraphHarness = (
  config: RenderHarnessConfig,
): GraphBenchmarkHarness => {
  const renderCounts = new Map<string, number>();

  const NodeSubscriber = ({
    nodeId,
  }: {
    nodeId: string;
  }): React.ReactElement => {
    const value = config.useNodeValue(nodeId);
    incrementRenderCount(renderCounts, nodeId);
    return React.createElement(
      "span",
      {
        "data-node-id": nodeId,
      },
      value,
    );
  };

  const GraphView = (): React.ReactElement =>
    React.createElement(
      React.Fragment,
      null,
      config.subscriberIds.map((nodeId) =>
        React.createElement(NodeSubscriber, {
          key: nodeId,
          nodeId,
        }),
      ),
    );

  const rendered = render(
    config.renderWithProviders(React.createElement(GraphView)),
  );

  const unaffectedNodeId = config.subscriberIds.find(
    (nodeId) => nodeId !== config.targetId,
  );
  if (!unaffectedNodeId) {
    throw new Error(
      "Benchmark requires at least one unaffected subscriber id.",
    );
  }
  const baselineTargetRenderCount = renderCounts.get(config.targetId) ?? 0;
  const baselineUnaffectedRenderCount = renderCounts.get(unaffectedNodeId) ?? 0;

  return {
    name: config.name,
    update: () => {
      act(() => {
        config.performUpdate();
      });
      return config.readTargetValue();
    },
    verify: () => {
      const targetRenderCount = renderCounts.get(config.targetId) ?? 0;
      const unaffectedRenderCount = renderCounts.get(unaffectedNodeId) ?? 0;
      expect(targetRenderCount).toBeGreaterThan(baselineTargetRenderCount);
      expect(unaffectedRenderCount).toBe(baselineUnaffectedRenderCount);
      expect(targetRenderCount).toBeGreaterThan(unaffectedRenderCount);
    },
    dispose: () => {
      act(() => {
        rendered.unmount();
      });
    },
  };
};

const createMuteHarness = (
  baseGraph: GraphRecord,
  subscriberIds: string[],
  targetId: string,
): GraphBenchmarkHarness => {
  const state = createMute({
    graph: cloneGraphRecord(baseGraph),
  });

  return createReactGraphHarness({
    name: "mute",
    performUpdate: () => {
      state.set((draft) => {
        const targetNode = draft.graph[targetId];
        if (!targetNode) return;
        targetNode.value += 1;
      });
    },
    readTargetValue: () => state.get().graph[targetId]?.value ?? -1,
    renderWithProviders: (child) => child,
    subscriberIds,
    targetId,
    useNodeValue: (nodeId) =>
      useMuteStore(state, (snapshot) => snapshot.graph[nodeId]?.value ?? -1),
  });
};

interface ZustandGraphState {
  graph: GraphRecord;
  incrementTarget: () => void;
}

const createZustandHarness = (
  baseGraph: GraphRecord,
  subscriberIds: string[],
  targetId: string,
): GraphBenchmarkHarness => {
  const useStore = createZustand<ZustandGraphState>((set) => ({
    graph: cloneGraphRecord(baseGraph),
    incrementTarget: () => {
      set((previousState) => {
        const targetNode = previousState.graph[targetId];
        if (!targetNode) return previousState;
        return {
          graph: {
            ...previousState.graph,
            [targetId]: {
              ...targetNode,
              value: targetNode.value + 1,
            },
          },
        };
      });
    },
  }));

  return createReactGraphHarness({
    name: "zustand",
    performUpdate: () => {
      useStore.getState().incrementTarget();
    },
    readTargetValue: () => useStore.getState().graph[targetId]?.value ?? -1,
    renderWithProviders: (child) => child,
    subscriberIds,
    targetId,
    useNodeValue: (nodeId) =>
      useStore((snapshot) => snapshot.graph[nodeId]?.value ?? -1),
  });
};

const createReduxHarness = (
  baseGraph: GraphRecord,
  subscriberIds: string[],
  targetId: string,
): GraphBenchmarkHarness => {
  const graphSlice = createSlice({
    initialState: {
      graph: cloneGraphRecord(baseGraph),
    },
    name: "graph",
    reducers: {
      incrementTarget: (state) => {
        const targetNode = state.graph[targetId];
        if (!targetNode) return;
        targetNode.value += 1;
      },
    },
  });

  const store = configureStore({
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({
        immutableCheck: false,
        serializableCheck: false,
      }),
    reducer: graphSlice.reducer,
  });

  type ReduxGraphState = ReturnType<typeof store.getState>;

  return createReactGraphHarness({
    name: "redux-toolkit",
    performUpdate: () => {
      store.dispatch(graphSlice.actions.incrementTarget());
    },
    readTargetValue: () => store.getState().graph[targetId]?.value ?? -1,
    renderWithProviders: (child) =>
      React.createElement(ReduxProvider, {
        children: child,
        store,
      }),
    subscriberIds,
    targetId,
    useNodeValue: (nodeId) =>
      useSelector(
        (snapshot: ReduxGraphState) => snapshot.graph[nodeId]?.value ?? -1,
      ),
  });
};

const createJotaiHarness = (
  baseGraph: GraphRecord,
  subscriberIds: string[],
  targetId: string,
): GraphBenchmarkHarness => {
  const graphAtom = atom<GraphRecord>(cloneGraphRecord(baseGraph));
  const incrementTargetAtom = atom(null, (get, set) => {
    const graph = get(graphAtom);
    const targetNode = graph[targetId];
    if (!targetNode) return;

    set(graphAtom, {
      ...graph,
      [targetId]: {
        ...targetNode,
        value: targetNode.value + 1,
      },
    });
  });
  const nodeValueAtoms = new Map<string, Atom<number>>();
  const getNodeValueAtom = (nodeId: string): Atom<number> => {
    const existingAtom = nodeValueAtoms.get(nodeId);
    if (existingAtom) return existingAtom;

    const createdAtom = selectAtom(
      graphAtom,
      (graph) => graph[nodeId]?.value ?? -1,
    );
    nodeValueAtoms.set(nodeId, createdAtom);
    return createdAtom;
  };
  const store = createJotaiStore();

  return createReactGraphHarness({
    name: "jotai",
    performUpdate: () => {
      store.set(incrementTargetAtom);
    },
    readTargetValue: () => store.get(graphAtom)[targetId]?.value ?? -1,
    renderWithProviders: (child) =>
      React.createElement(JotaiProvider, {
        children: child,
        store,
      }),
    subscriberIds,
    targetId,
    useNodeValue: (nodeId) => useAtomValue(getNodeValueAtom(nodeId)),
  });
};

const runReactGraphBenchmark = async (
  label: string,
  harnessFactories: Array<() => GraphBenchmarkHarness>,
): Promise<void> => {
  const harnesses = harnessFactories.map((factory) => factory());
  const bench = new Bench({
    iterations: 70,
    warmupIterations: 14,
  });
  let sink = 0;

  try {
    for (const harness of harnesses) {
      bench.add(harness.name, () => {
        sink += harness.update();
      });
    }

    await bench.run();
    expect(sink).toBeGreaterThan(0);

    for (const harness of harnesses) {
      harness.verify();
    }

    for (const task of bench.tasks) {
      const taskResult = task.result as
        | { throughput?: { mean?: number } }
        | undefined;
      expect(taskResult?.throughput?.mean ?? 0).toBeGreaterThan(0);
    }

    const table = bench.table();
    expect(table).toHaveLength(harnesses.length);
    process.stdout.write(`${label}\n${JSON.stringify(table, null, 2)}\n`);
  } finally {
    for (const harness of harnesses) {
      harness.dispose();
    }
  }
};

describe("react graph benchmark", () => {
  test("compares update + render throughput on a big graph record", async () => {
    const graph = buildGraphRecord(GRAPH_NODE_COUNT);
    const middleIndex = Math.floor(GRAPH_NODE_COUNT / 2);
    const targetId = `node-${middleIndex}`;
    const subscriberIds = buildSubscriberIds(
      GRAPH_NODE_COUNT,
      SUBSCRIBER_COUNT,
      targetId,
    );

    await runReactGraphBenchmark(
      `react graph update+render (${GRAPH_NODE_COUNT} nodes, ${SUBSCRIBER_COUNT} subscribers):`,
      [
        () => createMuteHarness(graph, subscriberIds, targetId),
        () => createZustandHarness(graph, subscriberIds, targetId),
        () => createReduxHarness(graph, subscriberIds, targetId),
        () => createJotaiHarness(graph, subscriberIds, targetId),
      ],
    );
  }, 90_000);
});
