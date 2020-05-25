import { LogLevel, Source } from "./debug/index";
import type { Block, Host } from "./interfaces";
import {
  createCache,
  getValue,
  isConst,
  TrackedCache,
  createResource,
  destroy,
  linkResource,
} from "./polyfill";

export function poll(updater: Updater, host: Host): Updater | void {
  return host.context(LogLevel.Info, updater, () => {
    getValue(updater);

    if (isConst(updater)) {
      return;
    } else {
      return updater;
    }
  });
}

export const UPDATER = Symbol("INITIALIZED UPDATER");
export type UPDATER = typeof UPDATER;
export type Updater = TrackedCache<(host: Host) => void> & { [UPDATER]: true };

export interface ReactiveRegion<Cursor, Atom> {
  initialize(cursor: Cursor, callback: Block<Cursor, Atom>): Updater;
}

export function updaters(list: Updater[], host: Host, source: Source): Updater {
  let current = list;

  let resource = createResource(() => {
    let newUpdaters: Updater[] = [];

    // Poll each `Updater`. If `poll` produced a new `Updater`, insert
    // it into the new updating array.
    for (let updater of current) {
      let result = host.indent(LogLevel.Info, () => poll(updater, host));

      if (result) {
        newUpdaters.push(updater);
      }
    }

    current = newUpdaters;
  }, source) as Updater;
  // The entire updaters cache is initialized because the individual items
  // were initialized.

  for (let updater of list) {
    linkResource(resource, updater);
  }

  return resource;
}
