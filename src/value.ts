import { tracked } from "@glimmerx/component";
import { createCache, getValue, isConst, TrackedCache } from "./polyfill";

export type ReactiveResult<T> =
  | {
      type: "const";
      value: T;
    }
  | {
      type: "mutable";
      value: T;
    };

export function getReactiveValue<T>(
  reactive: ReactiveValue<T>
): ReactiveResult<T> {
  return reactive.compute();
}

export interface ReactiveValue<T = unknown> {
  compute(): ReactiveResult<T>;
  value: T;
}

export interface Const<T = unknown> extends ReactiveValue<T> {
  value: T;
}

class ConstImpl<T> implements Const<T> {
  #value: T;

  constructor(value: T) {
    this.#value = value;
  }

  get value(): T {
    return this.#value;
  }

  compute(): ReactiveResult<T> {
    return {
      type: "const",
      value: this.#value,
    };
  }
}

export function Const<T>(value: T): Const<T> {
  return new ConstImpl(value);
}

export interface Cell<T = unknown> extends ReactiveValue<T> {
  value: T;
}

class CellImpl<T> implements Cell<T> {
  @tracked value: T;

  constructor(value: T) {
    this.value = value;
  }

  compute(): ReactiveResult<T> {
    return { type: "mutable", value: this.value };
  }
}

export function Cell<T>(value: T): Cell<T>;
export function Cell<T>(): Cell<T | undefined>;
export function Cell<T>(value?: T): Cell<T | undefined> {
  return new CellImpl(value);
}

export interface Derived<T = unknown> extends ReactiveValue<T> {}

class DerivedImpl<T> implements Derived<T> {
  #cache: TrackedCache<T>;

  constructor(callback: () => T) {
    this.#cache = createCache(callback);
  }

  get value(): T {
    return getValue(this.#cache);
  }

  compute(): ReactiveResult<T> {
    let result = getValue(this.#cache);

    if (isConst(this.#cache)) {
      return { type: "const", value: result };
    } else {
      return { type: "mutable", value: getValue(this.#cache) };
    }
  }
}

export function Derived<T>(callback: () => T): Derived<T> {
  return new DerivedImpl(callback);
}
