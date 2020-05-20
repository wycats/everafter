import {
  beginTrackFrame,
  consumeTag,
  endTrackFrame,
  isConstTag,
  validateTag,
  valueForTag,
} from "@glimmer/validator";
import type { Tag } from "@glimmer/validator/dist/types";
import type { Updater } from "./update";
import { unreachable, unwrap } from "./utils";
import {
  DebugFields,
  AnnotatedFunction,
  DEBUG,
  Structured,
  description,
  LogLevel,
  Debuggable,
  struct,
  Source,
} from "./debug/index";
import type { Host } from "./interfaces";
import { TrackedCache, createCache, getValue } from "./polyfill";

export const POLL = Symbol("POLL");

export class UnsafeDirtyTrack<T> {
  #callback: () => T;
  #tag: Tag | null = null;
  #snapshot = -1;
  #lastValue: T | null = null;

  constructor(callback: () => T) {
    this.#callback = callback;
  }

  compute(): T {
    if (this.#tag && validateTag(this.#tag, this.#snapshot)) {
      consumeTag(this.#tag);
    } else {
      beginTrackFrame();

      try {
        this.#lastValue = this.#callback();
      } finally {
        let tag = endTrackFrame();
        this.#tag = tag;
        this.#snapshot = valueForTag(tag);
      }
    }

    return unwrap(this.#lastValue);
  }

  get isConst(): boolean {
    if (this.#tag === null) {
      throw new Error(
        `invariant: can't check isDirty before computing the value`
      );
    }

    return isConstTag(this.#tag);
  }

  get isDirty(): boolean {
    if (this.#tag === null) {
      throw new Error(
        `invariant: can't check isDirty before computing the value`
      );
    }

    return validateTag(this.#tag, this.#snapshot);
  }
}

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
      return { value: callback.f(), identity: Symbol(String(DEBUG_ID++)) };
    });
    this.#source = callback.source;
  }

  [POLL](host: Host): void | Updater {
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

  get debugFields(): DebugFields | undefined {
    return new DebugFields("IsDirty", {
      cache: this.#cache,
      source: this.#source,
      identity: this.#identity,
    });
  }

  [DEBUG](): Structured {
    return struct(
      "IsDirty",
      ["cache", this.#source.describe("Cache")],
      ["identity", description(String(this.#identity))]
    );
  }
}

/**
 * This class represents a single bit of information: whether the input values
 * for a particular computation changed for a given execution of that computation.
 */
export class Freshness {
  #tag: Tag;
  #snapshot: number;

  constructor(tag: Tag, snapshot: number) {
    this.#tag = tag;
    this.#snapshot = snapshot;
  }

  get isConst(): boolean {
    return isConstTag(this.#tag);
  }

  get debugFields(): DebugFields {
    return new DebugFields("ValidComputation", {
      tag: this.#tag,
      snapshot: this.#snapshot,
    });
  }

  get isStale(): boolean {
    return !validateTag(this.#tag, this.#snapshot);
  }
}

const UNDEFINED = Symbol("UNDEFINED");
type UNDEFINED = typeof UNDEFINED;

export function unsafeCompute<T>(
  callback: () => T
): { freshness: Freshness; value: T } {
  beginTrackFrame();

  let value: T | typeof UNDEFINED = UNDEFINED;

  try {
    value = callback();
  } finally {
    let tag = endTrackFrame();
    let snapshot = valueForTag(tag);

    if (value !== UNDEFINED) {
      return { freshness: new Freshness(tag, snapshot), value };
    } else {
      unreachable(null as never);
    }
  }
}

export function poll(updater: Updater, host: Host): Updater | void {
  return host.context(LogLevel.Info, updater, () => updater[POLL](host));
}
