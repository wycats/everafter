import { isConstMemo, memoizeTracked } from "@glimmer/validator";
import {
  annotate,
  AnnotatedFunction,
  DEBUG,
  Debuggable,
  getSource,
  Source,
  Structured,
  description,
} from "./debug";
import { unwrap } from "./utils";
import {
  associateDestructor,
  destructor,
  associate,
  willDestroyAssociated,
  didDestroyAssociated,
} from "@glimmer/util";
import type { Host } from "./interfaces";

if (DEBUG === undefined) {
  debugger;
}

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

const DESCRIPTION = new WeakMap<object, Structured>();

export function describe(o: object, description: Structured): void {
  DESCRIPTION.set(o, description);
}

const HAS_DESCRIPTION = Symbol("HAS_DESCRIPTION");
type HAS_DESCRIPTION = typeof HAS_DESCRIPTION;

export type HasDescription<T> = T & { [HAS_DESCRIPTION]: true };

export function getDescription(o: HasDescription<unknown>): Structured {
  return DESCRIPTION.get(o) as Structured;
}

export function hasDescription<T extends object>(o: T): o is HasDescription<T> {
  return DESCRIPTION.has(o);
}

export function createCache<T>(
  callback: () => T,
  source: Source
): TrackedCache<T> {
  let memo = memoizeTracked(callback);
  let cache = new TrackedCache(annotate(memo, source));

  let desc = source.desc;
  if (desc) {
    describe(cache, description(desc));
  }

  return cache;
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

export class Resource<T> extends TrackedCache<T> {
  constructor(memo: AnnotatedFunction<() => T>, destructor: () => void) {
    super(memo);
    registerDestructor(this, destructor);
  }
}

export function createResource<T>(
  memo: () => T,
  source: Source,
  destructor?: () => void
): TrackedCache<T> {
  if (destructor) {
    return new Resource(annotate(memo, source), destructor);
  } else {
    return createCache(memo, source);
  }
}

export function linkResource(
  parent: object,
  child: TrackedCache<unknown>
): void {
  associateDestroyableChild(parent, child);
}

export function registerDestructor(parent: object, destroy: () => void): void {
  associateDestructor(
    parent,
    destructor({
      destroy,
    })
  );
}

export function associateDestroyableChild(parent: object, child: object): void {
  associate(parent, child);
}

export function destroy(o: object): void {
  willDestroyAssociated(o);
  didDestroyAssociated(o);
}
