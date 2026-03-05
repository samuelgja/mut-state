import { useSyncExternalStoreWithSelector } from "use-sync-external-store/shim/with-selector";
import { useRef } from "react";

import type { DeepReadonly, IsEqual, Selector, SourceLike } from "./mute.types";
import {
  GET_VERSIONED_SNAPSHOT,
  type InternalSourceLike,
  type VersionedSnapshot,
} from "./store-internals";

export const useStore = <Value, Selected = Value>(
  state: SourceLike<Value>,
  selector?: Selector<DeepReadonly<Value>, Selected>,
  isEqual: IsEqual<Selected> = Object.is,
): Selected => {
  type InternalSelection = Selected | VersionedSnapshot<Value>;

  const fallbackSnapshotReference = useRef<VersionedSnapshot<Value> | null>(
    null,
  );

  const internalState = state as InternalSourceLike<Value>;
  const getVersionedSnapshot =
    internalState[GET_VERSIONED_SNAPSHOT] ??
    (() => {
      const currentValue = state.get();
      const previousSnapshot = fallbackSnapshotReference.current;
      if (previousSnapshot && Object.is(previousSnapshot.value, currentValue)) {
        return previousSnapshot;
      }

      const nextSnapshot: VersionedSnapshot<Value> = {
        value: currentValue,
        version: (previousSnapshot?.version ?? -1) + 1,
      };
      fallbackSnapshotReference.current = nextSnapshot;
      return nextSnapshot;
    });

  const versionSelector = (
    snapshot: VersionedSnapshot<Value>,
  ): VersionedSnapshot<Value> => snapshot;
  const selectionSelector = selector
    ? (snapshot: VersionedSnapshot<Value>): InternalSelection =>
        selector(snapshot.value)
    : versionSelector;
  const selectionIsEqual = selector
    ? (left: InternalSelection, right: InternalSelection): boolean =>
        isEqual(left as Selected, right as Selected)
    : (left: InternalSelection, right: InternalSelection): boolean =>
        (left as VersionedSnapshot<Value>).version ===
        (right as VersionedSnapshot<Value>).version;

  const selectionResult = useSyncExternalStoreWithSelector<
    VersionedSnapshot<Value>,
    InternalSelection
  >(
    state.subscribe,
    getVersionedSnapshot,
    getVersionedSnapshot,
    selectionSelector,
    selectionIsEqual,
  );

  if (selector) return selectionResult as Selected;
  return (selectionResult as VersionedSnapshot<Value>).value as Selected;
};
