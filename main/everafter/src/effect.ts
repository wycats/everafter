import { LogLevel } from "./debug/index";
import type { Owner } from "./owner";
import { createResource, getValue } from "./polyfill";
import type { Updater } from "./update";

export const POLL = Symbol("POLL");

export interface UserEffect<T> {
  initialize: () => T;
  update: (value: T) => T | void;
  destroy?: (value: T | undefined) => void;
}

export type IntoEffect<T> = UserEffect<T> | ((value: T | undefined) => void);

export function intoEffect<T>(effect: IntoEffect<T>): UserEffect<T> {
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

export function initializeEffect<T>(
  owner: Owner,
  effect: IntoEffect<T>
): Updater {
  const { initialize, update, destroy } = intoEffect(effect);
  let value: T | UNINITIALIZED = UNINITIALIZED;
  let host = owner.host;

  let cache = createResource(
    () => {
      if (value === UNINITIALIZED) {
        host.logStatus(LogLevel.Info, `initializing`, "color: blue");
        value = initialize();
      } else {
        host.logStatus(LogLevel.Info, `updating`, "color: green");

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

  return cache as Updater;
}
