import type { Evaluate } from "./builder";
import {
  DEBUG,
  description,
  LogLevel,
  Structured,
  maybeGetSource,
  getSource,
} from "./debug/index";
import { initializeEffect } from "./effect";
import type { AppendingReactiveRange } from "./interfaces";
import { getOwner, Owned, Owner } from "./owner";
import { Region } from "./region";
import { poll, Updater } from "./update";

/**
 * Represents the root block of the entire output. The root block is never cleared
 * throughout the reactive lifetime of the block, and it corresponds to the entire
 * output.
 */
export class RootBlock<Cursor, Atom> extends Owned {
  #program: Evaluate<Cursor, Atom>;
  #update: Updater | void = undefined;

  constructor(owner: Owner, program: Evaluate<Cursor, Atom>) {
    super(owner);
    this.#program = program;
  }

  [DEBUG](): Structured {
    return description("RootBlock");
  }

  render(cursor: AppendingReactiveRange<Cursor, Atom>): Updater | void {
    let owner = getOwner(cursor);
    let host = owner.host;
    let source = maybeGetSource(this.#program);

    this.#update = owner.instantiate(initializeEffect, getSource(this), {
      initialize: () =>
        host.context(
          LogLevel.Info,
          source ? source.describe("root block") : undefined,
          () => owner.instantiate(Region.render, this.#program, cursor)
        ),
      update: (updater: Updater | void) => {
        host.context(LogLevel.Info, description("re-rendering"), () => {
          if (updater) {
            poll(updater);
          } else {
            host.logResult(LogLevel.Info, "nothing to do, no updaters");
          }
        });
      },
    });
  }

  rerender(): void {
    let host = getOwner(this).host;

    host.context(LogLevel.Info, description("rerendering"), () => {
      if (this.#update) {
        poll(this.#update);
      } else {
        host.logResult(LogLevel.Info, "nothing to do, no updaters");
      }
    });
  }
}
