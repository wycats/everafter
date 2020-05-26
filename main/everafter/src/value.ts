import { tracked } from "@glimmerx/component";
import {
  anything,
  DEBUG,
  Debuggable,
  description,
  newtype,
  Structured,
} from "./debug";
import { createCache, getValue, isConst, TrackedCache } from "./polyfill";

export type ReactiveResult<T> =
  | {
      type: "const";
      value: T;
    }
  | {
      type: "dynamic";
      value: T;
    };

export function getReactiveValue<T>(reactive: Var<T>): ReactiveResult<T> {
  return reactive.compute();
}

export interface Var<T = unknown> extends Debuggable {
  compute(): ReactiveResult<T>;
  current: T;
}

export interface Const<T = unknown> extends Var<T> {
  current: T;
}

class ConstImpl<T> implements Const<T> {
  #current: T;

  constructor(value: T) {
    this.#current = value;
  }

  [DEBUG](): Structured {
    return newtype("Const", anything(this.#current));
  }

  get current(): T {
    return this.#current;
  }

  compute(): ReactiveResult<T> {
    return {
      type: "const",
      value: this.#current,
    };
  }
}

export function Const<T>(value: T): Const<T> {
  return new ConstImpl(value);
}

export interface Cell<T = unknown> extends Var<T> {
  current: T;
}

class CellImpl<T> implements Cell<T> {
  @tracked current: T;

  constructor(value: T) {
    this.current = value;
  }

  [DEBUG](): Structured {
    return newtype("Cell", anything(this.current));
  }

  compute(): ReactiveResult<T> {
    return { type: "dynamic", value: this.current };
  }
}

export function Cell<T>(value: T): Cell<T>;
export function Cell<T>(): Cell<T | undefined>;
export function Cell<T>(value?: T): Cell<T | undefined> {
  return new CellImpl(value);
}

export interface Derived<T = unknown> extends Var<T> {}

class DerivedImpl<T> implements Derived<T> {
  #cache: TrackedCache<T>;

  constructor(callback: () => T) {
    this.#cache = createCache(callback);
  }

  get current(): T {
    return getValue(this.#cache);
  }

  [DEBUG](): Structured {
    return newtype("Derived", description("Derived"));
  }

  compute(): ReactiveResult<T> {
    let result = getValue(this.#cache);

    if (isConst(this.#cache)) {
      return { type: "const", value: result };
    } else {
      return { type: "dynamic", value: getValue(this.#cache) };
    }
  }
}

export function Derived<T>(callback: () => T): Derived<T> {
  return new DerivedImpl(callback);
}
