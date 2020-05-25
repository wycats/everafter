import type { Evaluate } from "./builder";
import {
  caller,
  DEBUG,
  LogLevel,
  newtype,
  PARENT,
  Structured,
  getSource,
  annotate,
} from "./debug/index";
import type { Host, Block, AppendingReactiveRange } from "./interfaces";
import { Region } from "./region";
import { Updater, poll } from "./update";
import { initializeEffect } from "./effect";

/**
 * Represents the root block of the entire output. The root block is never cleared
 * throughout the reactive lifetime of the block, and it corresponds to the entire
 * output.
 */
export class RootBlock<Cursor, Atom> {
  #program: Evaluate<Cursor, Atom>;
  #host: Host;
  #update: Updater | void = undefined;

  constructor(program: Evaluate<Cursor, Atom>, host: Host) {
    this.#program = program;
    this.#host = host;
  }

  [DEBUG](): Structured {
    return newtype("RootBlock", getSource(this.#program));
  }

  render(
    cursor: AppendingReactiveRange<Cursor, Atom>,
    source = caller(PARENT, "initial render")
  ): Updater | void {
    this.#update = initializeEffect(
      {
        initialize: annotate(
          () =>
            this.#host.context(LogLevel.Info, source, () =>
              this.#host.indent(LogLevel.Info, () =>
                Region.render(this.#program, cursor, this.#host)
              )
            ),
          source
        ),
        update: annotate((updater: Updater | void) => {
          this.#host.context(
            LogLevel.Info,
            source.describe("re-rendering"),
            () => {
              if (updater) {
                poll(updater, this.#host);
              } else {
                this.#host.logResult(
                  LogLevel.Info,
                  "nothing to do, no updaters"
                );
              }
            }
          );
        }, source),
      },
      this.#host,
      source
    );
  }

  rerender(source = caller(PARENT, "re-rendering")): void {
    this.#host.context(LogLevel.Info, source.describe("re-rendering"), () => {
      if (this.#update) {
        poll(this.#update, this.#host);
      } else {
        this.#host.logResult(LogLevel.Info, "nothing to do, no updaters");
      }
    });
    // this.#host.context(LogLevel.Info, source, () => {
    //   if (this.#update) {
    //     if (!poll(this.#update, this.#host)) {
    //       this.#update = undefined;
    //     }
    //   } else {
    //     this.#host.logResult(LogLevel.Info, "nothing to do, no updaters");
    //   }
    // });
  }
}
