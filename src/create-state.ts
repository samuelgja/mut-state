import {
  createVersionedSnapshotController,
  GET_VERSIONED_SNAPSHOT,
  notifyListeners,
  scheduleListeners,
  SUBSCRIBE_IMMEDIATE,
} from "./store-internals";
import type { DeepReadonly, MutableDraft, StateLike } from "./mute.types";
import type { InternalStateLike } from "./store-internals";

const isSupportedRootState = (value: unknown): value is object => {
  if (value === null || typeof value !== "object") return false;
  if (Array.isArray(value) || value instanceof Map || value instanceof Set) {
    return true;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

export const create = <Value>(initialState: Value): StateLike<Value> => {
  if (!isSupportedRootState(initialState)) {
    throw new Error(
      "Mute create(initialState) requires object, array, map, or set state.",
    );
  }

  const immediateListeners = new Set<() => void>();
  const scheduledListeners = new Set<() => void>();
  const mutableState = initialState as MutableDraft<Value>;
  const versionedSnapshotController = createVersionedSnapshotController(
    mutableState as DeepReadonly<Value>,
  );

  const state: InternalStateLike<Value> = {
    get: () => mutableState as DeepReadonly<Value>,
    set: (updater) => {
      updater(mutableState);
      versionedSnapshotController.commit(mutableState as DeepReadonly<Value>);
      notifyListeners(immediateListeners);
      scheduleListeners(scheduledListeners);
    },
    subscribe: (callback) => {
      scheduledListeners.add(callback);
      return () => {
        scheduledListeners.delete(callback);
      };
    },
    [SUBSCRIBE_IMMEDIATE]: (callback) => {
      immediateListeners.add(callback);
      return () => {
        immediateListeners.delete(callback);
      };
    },
    [GET_VERSIONED_SNAPSHOT]: versionedSnapshotController.getSnapshot,
  };

  return state;
};
