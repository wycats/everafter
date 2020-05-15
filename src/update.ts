// eslint-disable-next-line import/no-cycle
import { POLL, poll, IsDirty } from "./unsafe";
import {
  DEBUG,
  Debuggable,
  LogLevel,
  AnnotatedFunction,
  Structured,
  DebugFields,
  struct,
} from "./debug/index";
import type { Host, Operations, UserBlock } from "./interfaces";

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
  [POLL](host: Host): Updater | void;
}

export interface ReactiveRegion<Ops extends Operations> {
  initialize(cursor: Ops["cursor"], callback: UserBlock<Ops>): Updater;
}

/**
 * This function takes a callback.
 *
 * When the callback is executed, it performs trackable work and returns
 * an `Updater`.
 *
 * If the operation was const, the `Updater` is ignored. Otherwise, it's
 * wrapped in an `UpdatingOperation`, which implements `Updater` for the
 * operation.
 */
export function initialize(
  operation: AnnotatedFunction<() => Updater | void>,
  host: Host
): Updater | void {
  return IsDirty.initialize(operation, host);
}

export type PresentUpdaters = readonly [Updater, ...Updater[]];

export function toPresentUpdaters(
  updaters: Updater[] | void
): PresentUpdaters | void {
  if (updaters === undefined) {
    return;
  }

  if (updaters.length > 0) {
    return (updaters as unknown) as PresentUpdaters;
  }
}

export function pollUpdaters(
  oldUpdaters: PresentUpdaters,
  host: Host
): Updater | void {
  // Rebuild the updating array.
  let newUpdaters: Updater[] = [];

  // Poll each `Updater`. If `poll` produced a new `Updater`, insert
  // it into the new updating array.
  for (let updater of oldUpdaters) {
    let result = host.indent(LogLevel.Info, () => poll(updater, host));

    if (result !== undefined) {
      newUpdaters.push(result);
    }
  }

  return toUpdater(newUpdaters);
}

export function toUpdater(updaters: Updater[] | void): Updater | void {
  let present = toPresentUpdaters(updaters);
  if (present === undefined) {
    return;
  } else if (present.length === 1) {
    return present[0];
  } else {
    return new StaticBlockResult(present);
  }
}

export class StaticBlockResult implements Updater {
  // The updaters that should be polled when this result is polled and
  // `#freshness` is not stale.
  #updaters: readonly [Updater, ...Updater[]];

  constructor(updaters: PresentUpdaters) {
    this.#updaters = updaters;
  }

  [DEBUG](): Structured {
    return struct("StaticBlockResult", ["updaters", this.#updaters]);
  }

  get debugFields(): DebugFields {
    return new DebugFields("BlockResult", {
      updaters: this.#updaters,
    });
  }

  [POLL](host: Host): Updater | void {
    return pollUpdaters(this.#updaters, host);
  }
}
