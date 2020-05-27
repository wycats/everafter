import type { Source } from "./debug/index";
import type { Owner } from "./owner";
import { createResource, getValue } from "./polyfill";
import { Updater, updater } from "./update";
import type { Var } from "./value";

export const POLL = Symbol("POLL");

export interface UserEffect<T, Args extends readonly Var<unknown>[]> {
  initialize: (...args: Args) => T;
  update: (value: T) => T | void;
  destroy?: (value: T | undefined) => void;
}

export type IntoEffect<T, Args extends readonly Var<unknown>[]> =
  | UserEffect<T, Args>
  | ((value: T | undefined, ...args: Args) => void);

export function intoEffect<T, Args extends readonly Var<unknown>[]>(
  effect: IntoEffect<T, Args>
): UserEffect<T, Args> {
  if (typeof effect === "function") {
    return {
      initialize: effect as () => T,
      update: effect as () => T,
    };
  } else {
    return effect;
  }
}

const UNINITIALIZED = Symbol("UNINITIALIZED");
type UNINITIALIZED = typeof UNINITIALIZED;

export function initializeEffect<T, Args extends readonly Var<unknown>[]>(
  owner: Owner,
  source: Source,
  effect: IntoEffect<T, Args>,
  ...args: Args
): Updater {
  const { initialize, update, destroy } = intoEffect(effect);
  let value: T | UNINITIALIZED = UNINITIALIZED;

  let cache = createResource(
    () => {
      if (value === UNINITIALIZED) {
        value = initialize(...args);
      } else {
        let next = update(value);

        if (next !== undefined) {
          value = next;
        }
      }
    },
    owner,
    destroy
      ? () => destroy(value === UNINITIALIZED ? undefined : value)
      : undefined
  );

  // initialize effect
  getValue(cache);

  return updater(cache, source);
}
