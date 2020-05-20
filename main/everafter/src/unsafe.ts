import {
  AnnotatedFunction,
  DEBUG,
  Debuggable,
  description,
  LogLevel,
  Source,
  struct,
  Structured,
  getSource,
} from "./debug/index";
import type { Host } from "./interfaces";
import { createCache, getValue, TrackedCache } from "./polyfill";
import { Updater, poll } from "./update";

export const POLL = Symbol("POLL");

let DEBUG_ID = 0;

export class IsDirty implements Debuggable, Updater {
  static initialize(
    callback: AnnotatedFunction<() => Updater | void>,
    host: Host
  ): Updater | void {
    let dirty = new IsDirty(callback);
    return poll(dirty, host);
  }

  #cache: TrackedCache<{ value: Updater | void; identity: symbol }>;
  #source: Source;
  #identity: symbol | UNDEFINED = UNDEFINED;

  private constructor(callback: AnnotatedFunction<() => Updater | void>) {
    this.#cache = createCache(() => {
      return { value: callback(), identity: Symbol(String(DEBUG_ID++)) };
    });
    this.#source = getSource(callback);
  }

  poll(host: Host): void | Updater {
    const { identity, value: newUpdater } = getValue(this.#cache);

    if (identity === this.#identity) {
      host.logResult(LogLevel.Info, "no change");
      return this;
    }

    if (newUpdater === undefined) {
      host.logResult(
        LogLevel.Info,
        "became constant, no further changes possible"
      );
      return;
    }

    this.#cache = createCache(() => {
      let value = poll(newUpdater, host);
      return { value, identity: Symbol(String(DEBUG_ID++)) };
    });

    host.logResult(LogLevel.Info, "re-executed the callback");

    this.#identity = identity;
    return this;
  }

  [DEBUG](): Structured {
    return struct("IsDirty", {
      cache: this.#source.describe("Cache"),
      identity: description(String(this.#identity)),
    });
  }
}

const UNDEFINED = Symbol("UNDEFINED");
type UNDEFINED = typeof UNDEFINED;
