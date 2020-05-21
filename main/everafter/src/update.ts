// eslint-disable-next-line import/no-cycle
import { Effect } from "./effect";
import {
  DEBUG,
  Debuggable,
  LogLevel,
  AnnotatedFunction,
  Structured,
  struct,
  description,
} from "./debug/index";
import type { Host, Block } from "./interfaces";

export class Poll {
  #updater: Updater | void;

  constructor(updater: Updater | void) {
    this.#updater = updater;
  }

  get kind(): "dynamic" | "const" {
    if (this.#updater) {
      return "dynamic";
    } else {
      return "const";
    }
  }

  ifConst(callback: () => void): void {
    if (this.#updater === undefined) {
      callback();
    }
  }

  ifDynamic(callback: (updater: Updater) => void): void {
    if (this.#updater !== undefined) {
      callback(this.#updater);
    }
  }

  get updater(): Updater | void {
    return this.#updater;
  }
}

export function poll(updater: Updater, host: Host): Poll {
  return host.context(LogLevel.Info, updater, () => {
    let result = updater.poll(host);

    if (result === "const") {
      return new Poll(undefined);
    } else {
      return new Poll(updater);
    }
  });
}

/**
 * An `Updater` is an object that can be polled periodically in order to
 * reflect changes in inputs onto the output. Every time an `Updater` is
 * polled, it returns another `Updater` if the output can still change in
 * response to input changes, or void if no further changes are possible.
 *
 * The `Updater` itself is not itself responsible for the decision about
 * when it should be polled. Instead, the code that produces the `Updater`
 * is responsible for attaching it to a trackable computation by using the
 * `updateWith` API on `Block`.
 */
export interface Updater extends Debuggable {
  // poll returns an Updater if the possibility for change still exists,
  // and void if it doesn't.
  poll(host: Host): "const" | "dynamic";
}

export interface ReactiveRegion<Cursor, Atom> {
  initialize(cursor: Cursor, callback: Block<Cursor, Atom>): Updater;
}

export class Updaters implements Updater {
  #updaters: Updater[] = [];

  add(updater: Updater): void {
    this.#updaters.push(updater);
  }

  *[Symbol.iterator]() {
    for (let updater of this.#updaters) {
      yield updater;
    }
  }

  [DEBUG](): Structured {
    return description("Updaters");
  }

  poll(host: Host): "const" | "dynamic" {
    let newUpdaters: Updater[] = [];

    // Poll each `Updater`. If `poll` produced a new `Updater`, insert
    // it into the new updating array.
    for (let updater of this.#updaters) {
      let result = host.indent(LogLevel.Info, () => poll(updater, host));

      result.ifDynamic(updater => newUpdaters.push(updater));
    }

    if (newUpdaters.length === 0) {
      return "const";
    } else {
      this.#updaters = newUpdaters;
      return "dynamic";
    }
  }
}
