import { LogLevel, Source } from "./debug/index";
import type { Block } from "./interfaces";
import {
  createCache,
  getValue,
  isConst,
  TrackedCache,
  createResource,
  destroy,
  linkResource,
} from "./polyfill";
import { Host, Owned, getOwner, Owner } from "./owner";

export function poll(updater: Updater): Updater | void {
  let host = getOwner(updater).host;
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
export type UpdaterThunk = (host: Host) => Updater | void;
export type Updater = TrackedCache<() => void> & { [UPDATER]: true } & Owned;

export interface ReactiveRegion<Cursor, Atom> {
  initialize(cursor: Cursor, callback: Block<Cursor, Atom>): Updater;
}

export function updaters(
  list: Updater[],
  owner: Owner,
  source: Source
): Updater {
  let current = list;
  let host = owner.host;

  let resource = createResource(
    () => {
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
    },
    source,
    owner
  ) as Updater;
  // The entire updaters cache is initialized because the individual items
  // were initialized.

  for (let updater of list) {
    linkResource(resource, updater);
  }

  return resource;
}
