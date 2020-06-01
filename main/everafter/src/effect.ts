import type { Source } from "./debug/index";
import type { Owner } from "./owner";
import { createResource, getValue } from "./polyfill";
import { Updater, updater } from "./update";
import type { Var } from "./value";
import { UNINITIALIZED } from "./utils";

export const POLL = Symbol("POLL");

export interface UserEffect<T, Args extends readonly Var<unknown>[]> {
  initialize: (...args: Args) => T;
  update: (value: T) => T | void;
  destroy?: (value: T | undefined) => void;
}

export function intoEffect<T, Args extends readonly Var<unknown>[]>(
  effect: UserEffect<T, Args>
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

export function initializeEffect<T, Args extends readonly Var<unknown>[]>(
  owner: Owner,
  source: Source,
  effect: UserEffect<T, Args>,
  ...args: Args
): Updater {
  const { initialize, update, destroy } = effect;
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
    destroy ? () => destroy(value === UNINITIALIZED ? undefined : value) : undefined
  );

  // initialize effect
  getValue(cache);

  return updater(cache, source);
}
