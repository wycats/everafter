import {
  DEBUG,
  Debuggable,
  description,
  LogLevel,
  Source,
  struct,
  Structured,
} from "./debug/index";
import type { Host } from "./interfaces";
import { createCache, getValue, isConst, TrackedCache } from "./polyfill";
import { poll, Updater } from "./update";

export const POLL = Symbol("POLL");

let DEBUG_ID = 0;

export function effect(
  callback: () => Updater,
  source: Source,
  host: Host
): Updater | void {
  let updater = callback();
  let effect = new Effect(updater, host, source);

  if (effect.poll(host) === "const") {
    return;
  } else {
    return effect;
  }
}

export class Effect implements Debuggable, Updater {
  #cache: TrackedCache<{ identity: symbol }>;
  #source: Source;
  #identity: symbol | undefined = undefined;

  constructor(updater: Updater, host: Host, source: Source) {
    this.#cache = createCache(() => {
      return {
        value: poll(updater, host),
        identity: Symbol(String(DEBUG_ID++)),
      };
    });
    this.#source = source;
  }

  poll(host: Host): "const" | "dynamic" {
    const { identity } = getValue(this.#cache);

    if (identity === this.#identity) {
      host.logResult(LogLevel.Info, "no change");
      return "dynamic";
    }

    if (isConst(this.#cache)) {
      host.logResult(
        LogLevel.Info,
        "became constant, no further changes possible"
      );
      return "const";
    }

    host.logResult(LogLevel.Info, "re-executed the callback");

    this.#identity = identity;
    return "dynamic";
  }

  [DEBUG](): Structured {
    return struct("Effect", {
      cache: this.#source.describe("Cache"),
      identity: description(String(this.#identity)),
    });
  }
}
