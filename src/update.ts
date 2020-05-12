import { UnsafeUpdatable } from "./unsafe";

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
export interface Updater {
  // poll returns an Updater if the possibility for change still exists,
  // and void if it doesn't.
  poll(): Updater | void;
}

export class UpdatingOperation {
  #computation: UnsafeUpdatable;

  constructor(computation: UnsafeUpdatable) {
    this.#computation = computation;
  }

  poll(): Updater | void {
    let result = this.#computation.poll();

    switch (result) {
      case "const":
        return;
      case "mutable":
        return this;
    }
  }
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
export function updating(operation: () => Updater): UpdatingOperation | void {
  let tracked = new UnsafeUpdatable(operation);
  let kind = tracked.initialize();

  if (kind === "const") {
    return;
  }

  return new UpdatingOperation(tracked);
}

export type PresentUpdaters = readonly [Updater, ...Updater[]];

export function pollUpdaters<T>(
  oldUpdaters: PresentUpdaters,
  callback: (updaters: PresentUpdaters) => T
): T | void {
  // Rebuild the updating array.
  let newUpdaters: Updater[] = [];

  // Poll each `Updater`. If `poll` produced a new `Updater`, insert
  // it into the new updating array.
  for (let updater of oldUpdaters) {
    let result = updater.poll();

    if (result !== undefined) {
      newUpdaters.push(result);
    }
  }

  // If there's at least one new updater, call the callback
  if (newUpdaters.length > 0) {
    return callback(newUpdaters as [Updater, ...Updater[]]);
  }
}
