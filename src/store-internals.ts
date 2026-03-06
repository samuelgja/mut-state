import type { DeepReadonly, SourceLike, StateLike } from "./mute.types";

export const GET_VERSIONED_SNAPSHOT = Symbol("mute.get-versioned-snapshot");
export const SUBSCRIBE_IMMEDIATE = Symbol("mute.subscribe-immediate");

export interface VersionedSnapshot<Value> {
  version: number;
  value: DeepReadonly<Value>;
}

export interface InternalSourceLike<Value> extends SourceLike<Value> {
  [GET_VERSIONED_SNAPSHOT]?: () => VersionedSnapshot<Value>;
  [SUBSCRIBE_IMMEDIATE]?: (callback: () => void) => () => void;
}

export interface InternalStateLike<Value>
  extends StateLike<Value>, InternalSourceLike<Value> {}

export interface VersionedSnapshotController<Value> {
  commit: (value: DeepReadonly<Value>) => void;
  getSnapshot: () => VersionedSnapshot<Value>;
}

const pendingNotificationSets = new Set<Set<() => void>>();
let isFlushScheduled = false;

const flushScheduledNotifications = (): void => {
  isFlushScheduled = false;
  const queuedNotificationSets = [...pendingNotificationSets];
  pendingNotificationSets.clear();

  for (const listeners of queuedNotificationSets) {
    for (const listener of listeners) listener();
  }
};

export const notifyListeners = (listeners: Set<() => void>): void => {
  for (const listener of listeners) listener();
};

export const scheduleListeners = (listeners: Set<() => void>): void => {
  if (listeners.size === 0) return;
  pendingNotificationSets.add(listeners);
  if (isFlushScheduled) return;

  isFlushScheduled = true;
  queueMicrotask(flushScheduledNotifications);
};

export const subscribeImmediate = <Value>(
  source: SourceLike<Value>,
  callback: () => void,
): (() => void) => {
  const internalSource = source as InternalSourceLike<Value>;
  const subscribeNow = internalSource[SUBSCRIBE_IMMEDIATE];
  if (subscribeNow) return subscribeNow(callback);
  return source.subscribe(callback);
};

export const createVersionedSnapshotController = <Value>(
  initialValue: DeepReadonly<Value>,
): VersionedSnapshotController<Value> => {
  let version = 0;
  let snapshot: VersionedSnapshot<Value> = {
    value: initialValue,
    version,
  };

  return {
    commit: (nextValue) => {
      version += 1;
      snapshot = {
        value: nextValue,
        version,
      };
    },
    getSnapshot: () => snapshot,
  };
};
