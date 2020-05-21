import { isConstMemo, memoizeTracked } from "@glimmer/validator";
import {
  annotate,
  AnnotatedFunction,
  DEBUG,
  Debuggable,
  getSource,
  Source,
  Structured,
} from "./debug";
import { unwrap } from "./utils";

const NULL = Symbol("NULL");

const CACHE = new WeakMap<
  TrackedCache<unknown>,
  { value: unknown; memo: AnnotatedFunction<() => unknown> }
>();

const TRACKED = Symbol("TRACKED");
type TRACKED = typeof TRACKED;

export class TrackedCache<T> implements Debuggable {
  declare tracked: TRACKED;

  constructor(memo: AnnotatedFunction<() => T>) {
    CACHE.set(this, { value: NULL, memo });
    Object.freeze(this);
  }

  [DEBUG](): Structured {
    return getSource(unwrap(CACHE.get(this)).memo)[DEBUG]();
  }
}

export function createCache<T>(
  callback: () => T,
  source: Source
): TrackedCache<T> {
  let memo = memoizeTracked(callback);
  return new TrackedCache(annotate(memo, source));
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
