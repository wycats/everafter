import {
  associate,
  associateDestructor,
  destructor,
  didDestroyAssociated,
  willDestroyAssociated,
} from "@glimmer/util";
import { isConstMemo, memoizeTracked } from "@glimmer/validator";
import {
  DEBUG,
  Structured,
} from "./debug";
import { Owned, Owner, setOwner, ClassFactory, getOwner } from "./owner";
import { unwrap } from "./utils";

if (DEBUG === undefined) {
  debugger;
}

const NULL = Symbol("NULL");

const CACHE = new WeakMap<
  TrackedCache<unknown>,
  { value: unknown; memo: () => unknown }
>();

const TRACKED = Symbol("TRACKED");
type TRACKED = typeof TRACKED;

export class TrackedCache<T> {
  declare tracked: TRACKED;

  constructor(memo: () => T) {
    CACHE.set(this, { value: NULL, memo });
    Object.freeze(this);
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

export function createCache<T>(callback: () => T): TrackedCache<T> {
  let memo = memoizeTracked(callback);
  let cache = new TrackedCache(memo);

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

export class Resource<T> extends TrackedCache<T> implements Owned {
  constructor(owner: Owner, memo: () => T, destructor?: () => void) {
    super(memo);
    setOwner(this, owner);

    if (destructor) {
      registerDestructor(this, destructor);
    }
  }

  new<A extends unknown[], T extends Owned | void>(
    f: ClassFactory<T, A>,
    ...args: A
  ): T {
    let instance = new f(getOwner(this), ...args);
    return instance;
  }
}

export function createResource<T>(
  memo: () => T,
  owner: Owner,
  destructor?: () => void
): Resource<T> {
  return new Resource(owner, memoizeTracked(memo), destructor);
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
