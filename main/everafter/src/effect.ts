import {
  caller,
  PARENT,
  LogLevel,
  AnnotatedFunction,
  isAnnotated,
  printStructured,
} from "./debug/index";
import {
  createCache,
  getValue,
  TrackedCache,
  createResource,
} from "./polyfill";
import type { Updater } from "./update";
import type { Host } from "./interfaces";

export const POLL = Symbol("POLL");

export interface UserEffect<T> {
  initialize: AnnotatedFunction<() => T>;
  update: AnnotatedFunction<(value: T) => T | void>;
  destroy?: AnnotatedFunction<(value: T | undefined) => void>;
}

export type IntoEffect<T> =
  | UserEffect<T>
  | AnnotatedFunction<(value: T | undefined) => void>;

export function intoEffect<T>(effect: IntoEffect<T>): UserEffect<T> {
  if (isAnnotated(effect)) {
    return {
      initialize: effect as AnnotatedFunction<() => T>,
      update: effect as AnnotatedFunction<() => T>,
    };
  } else {
    return effect;
  }
}

const UNINITIALIZED = Symbol("UNINITIALIZED");
type UNINITIALIZED = typeof UNINITIALIZED;

export function initializeEffect<T>(
  effect: IntoEffect<T>,
  host: Host,
  source = caller(PARENT)
): Updater {
  const { initialize, update, destroy } = intoEffect(effect);
  let value: T | UNINITIALIZED = UNINITIALIZED;

  let cache = createResource(
    () => {
      if (value === UNINITIALIZED) {
        host.logStatus(
          LogLevel.Info,
          `initializing ${printStructured(source, true)}`,
          "color: blue"
        );
        value = initialize();
      } else {
        host.logStatus(
          LogLevel.Info,
          `updating ${printStructured(source, true)}`,
          "color: green"
        );

        let next = update(value);

        if (next !== undefined) {
          value = next;
        }
      }
    },
    source,
    destroy
      ? () => destroy(value === UNINITIALIZED ? undefined : value)
      : undefined
  );

  // initialize effect
  getValue(cache);

  return cache as Updater;
}
