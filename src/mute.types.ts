type PrimitiveValue =
  | bigint
  | boolean
  | null
  | number
  | string
  | symbol
  | undefined;

export type DeepReadonly<Value> = Value extends
  | PrimitiveValue
  | ((...args: never[]) => unknown)
  ? Value
  : Value extends Map<infer MapKey, infer MapValue>
    ? ReadonlyMap<DeepReadonly<MapKey>, DeepReadonly<MapValue>>
    : Value extends Set<infer SetValue>
      ? ReadonlySet<DeepReadonly<SetValue>>
      : Value extends Array<infer ItemValue>
        ? ReadonlyArray<DeepReadonly<ItemValue>>
        : { readonly [Key in keyof Value]: DeepReadonly<Value[Key]> };

export type MutableDraft<Value> = Value extends
  | PrimitiveValue
  | ((...args: never[]) => unknown)
  ? Value
  : Value extends ReadonlyMap<infer MapKey, infer MapValue>
    ? Map<MutableDraft<MapKey>, MutableDraft<MapValue>>
    : Value extends Map<infer MapKey, infer MapValue>
      ? Map<MutableDraft<MapKey>, MutableDraft<MapValue>>
      : Value extends ReadonlySet<infer SetValue>
        ? Set<MutableDraft<SetValue>>
        : Value extends Set<infer SetValue>
          ? Set<MutableDraft<SetValue>>
          : Value extends ReadonlyArray<infer ItemValue>
            ? MutableDraft<ItemValue>[]
            : Value extends Array<infer ItemValue>
              ? MutableDraft<ItemValue>[]
              : { -readonly [Key in keyof Value]: MutableDraft<Value[Key]> };

export interface SourceLike<Value> {
  get: () => DeepReadonly<Value>;
  subscribe: (callback: () => void) => () => void;
}

export interface StateLike<Value> extends SourceLike<Value> {
  set: (updater: (previousState: MutableDraft<Value>) => void) => void;
}

export type Selector<Input, Output> = (value: Input) => Output;
export type IsEqual<Value> = (left: Value, right: Value) => boolean;
