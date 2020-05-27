import {
  LogLevel,
  Source,
  setDefaultSource,
  NO_SOURCE,
  getSourceFrame,
} from "./debug/index";
import type { Block } from "./interfaces";
import {
  getOwner,
  Host,
  Owned,
  Owner,
  IGNORE,
  SUCCESS,
  UPDATE,
  group,
} from "./owner";
import {
  createResource,
  getValue,
  isConst,
  linkResource,
  TrackedCache,
} from "./polyfill";

export function poll(updater: Updater): Updater | void {
  let host = getOwner(updater).host;
  return host.context(LogLevel.Info, updater, () => {
    getValue(updater);

    if (isConst(updater)) {
      host.logResult(LogLevel.Info, "const", group(IGNORE, UPDATE));
      return;
    } else {
      host.logResult(LogLevel.Info, "dynamic", group(SUCCESS, UPDATE));
      return updater;
    }
  });
}

export const UPDATER = Symbol("INITIALIZED UPDATER");
export type UPDATER = typeof UPDATER;
export type UpdaterThunk = (host: Host) => Updater | void;
export type Updater = TrackedCache<() => void> & { [UPDATER]: true } & Owned;

export function updater(
  input: TrackedCache<() => void> & Owned,
  source: Source
): Updater {
  setDefaultSource(input, source);
  return input as Updater;
}

export interface ReactiveRegion<Cursor, Atom> {
  initialize(cursor: Cursor, callback: Block<Cursor, Atom>): Updater;
}

export function updaters(list: Updater[], owner: Owner): Updater {
  let current = list;
  let host = owner.host;

  let resource = createResource(() => {
    let newUpdaters: Updater[] = [];

    // Poll each `Updater`. If `poll` produced a new `Updater`, insert
    // it into the new updating array.
    for (let updater of current) {
      let result = host.indent(LogLevel.Info, () => poll(updater));

      if (result) {
        newUpdaters.push(updater);
      }
    }

    current = newUpdaters;
  }, owner);
  // The entire updaters cache is initialized because the individual items
  // were initialized.

  for (let updater of list) {
    linkResource(resource, updater);
  }

  return resource as Updater;
}
