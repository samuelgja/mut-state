import {
  createVersionedSnapshotController,
  GET_VERSIONED_SNAPSHOT,
  notifyListeners,
  scheduleListeners,
  subscribeImmediate,
  SUBSCRIBE_IMMEDIATE,
} from "./store-internals";
import type { DeepReadonly, SourceLike, StateLike } from "./mute.types";
import type { InternalStateLike } from "./store-internals";

type ExtractStateValue<State> =
  State extends SourceLike<infer Value> ? DeepReadonly<Value> : never;

const getSourceValues = <Sources extends readonly SourceLike<unknown>[]>(
  sources: Sources,
): { [Key in keyof Sources]: ExtractStateValue<Sources[Key]> } =>
  sources.map((source) => source.get()) as {
    [Key in keyof Sources]: ExtractStateValue<Sources[Key]>;
  };

export const derive = <Sources extends readonly SourceLike<unknown>[], Result>(
  ...args: [
    ...sources: Sources,
    projector: (
      ...values: { [Key in keyof Sources]: ExtractStateValue<Sources[Key]> }
    ) => Result,
  ]
): StateLike<Result> => {
  const projector = args.at(-1) as (
    ...values: { [Key in keyof Sources]: ExtractStateValue<Sources[Key]> }
  ) => Result;
  const sources = args.slice(0, -1) as unknown as Sources;

  let currentState = projector(...getSourceValues(sources));
  const versionedSnapshotController = createVersionedSnapshotController(
    currentState as DeepReadonly<Result>,
  );
  let sourceUnsubscribers: Array<() => void> = [];
  const immediateListeners = new Set<() => void>();
  const scheduledListeners = new Set<() => void>();

  const hasStateListeners = (): boolean =>
    immediateListeners.size > 0 || scheduledListeners.size > 0;

  const recomputeState = (): void => {
    const nextState = projector(...getSourceValues(sources));
    if (Object.is(currentState, nextState)) return;
    currentState = nextState;
    versionedSnapshotController.commit(currentState as DeepReadonly<Result>);
    notifyListeners(immediateListeners);
    scheduleListeners(scheduledListeners);
  };

  const subscribeSources = (): void => {
    sourceUnsubscribers = sources.map((source) =>
      subscribeImmediate(source, recomputeState),
    );
  };

  const unsubscribeSources = (): void => {
    for (const unsubscribe of sourceUnsubscribers) unsubscribe();
    sourceUnsubscribers = [];
  };

  const state: InternalStateLike<Result> = {
    get: () => currentState as DeepReadonly<Result>,
    set: () => {
      throw new Error("Derived state is read-only.");
    },
    subscribe: (callback) => {
      const hasListenersBeforeSubscription = hasStateListeners();
      scheduledListeners.add(callback);
      if (!hasListenersBeforeSubscription) subscribeSources();
      return () => {
        scheduledListeners.delete(callback);
        if (!hasStateListeners()) unsubscribeSources();
      };
    },
    [SUBSCRIBE_IMMEDIATE]: (callback) => {
      const hasListenersBeforeSubscription = hasStateListeners();
      immediateListeners.add(callback);
      if (!hasListenersBeforeSubscription) subscribeSources();
      return () => {
        immediateListeners.delete(callback);
        if (!hasStateListeners()) unsubscribeSources();
      };
    },
    [GET_VERSIONED_SNAPSHOT]: versionedSnapshotController.getSnapshot,
  };

  return state;
};
