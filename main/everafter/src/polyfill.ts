import { memoizeTracked, isConstMemo } from "@glimmer/validator";
import { unwrap } from "./utils";

const NULL = Symbol("NULL");

const CACHE = new WeakMap<
  TrackedCache<unknown>,
  { value: unknown; memo: () => unknown }
>();

export class TrackedCache<T> {
  constructor(memo: () => T) {
    CACHE.set(this, { value: NULL, memo });
    Object.freeze(this);
  }
}

export function createCache<T>(callback: () => T): TrackedCache<T> {
  let memo = memoizeTracked(callback);
  return new TrackedCache(memo);
}

export function getValue<T>(cache: TrackedCache<T>): T {
  let entry = unwrap(CACHE.get(cache));

  let value = entry.memo() as T;
  entry.value = value;

  return value;
}

export function isConst(cache: TrackedCache<unknown>): boolean {
  let { memo } = unwrap(CACHE.get(cache));
  return isConstMemo(memo);
}
