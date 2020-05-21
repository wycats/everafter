import { caller, PARENT } from "./debug/index";
import { createCache, getValue, TrackedCache } from "./polyfill";
import type { Updater } from "./update";

export const POLL = Symbol("POLL");

export type UserEffect = () => void;

export function initializeEffect(
  callback: UserEffect,
  source = caller(PARENT)
): Updater {
  let cache = createCache(() => {
    callback();
  }, source);

  getValue(cache);
  return cache as Updater;
}

export function effect(
  callback: UserEffect,
  source = caller(PARENT)
): TrackedCache<void> {
  return createCache(() => {
    callback();
  }, source);
}
