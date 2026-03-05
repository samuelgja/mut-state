import type { DeepReadonly, SourceLike, StateLike } from "./mute.types";

export const GET_VERSIONED_SNAPSHOT = Symbol("mute.get-versioned-snapshot");

export interface VersionedSnapshot<Value> {
  version: number;
  value: DeepReadonly<Value>;
}

export interface InternalSourceLike<Value> extends SourceLike<Value> {
  [GET_VERSIONED_SNAPSHOT]?: () => VersionedSnapshot<Value>;
}

export interface InternalStateLike<Value>
  extends StateLike<Value>, InternalSourceLike<Value> {}

export interface VersionedSnapshotController<Value> {
  commit: (value: DeepReadonly<Value>) => void;
  getSnapshot: () => VersionedSnapshot<Value>;
}

export const notifyListeners = (listeners: Set<() => void>): void => {
  for (const listener of listeners) listener();
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
