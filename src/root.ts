import type { Evaluate } from "./builder";
import {
  caller,
  DEBUG,
  DebugFields,
  LogLevel,
  newtype,
  PARENT,
  Structured,
} from "./debug/index";
import type { Host, UserBlock, Operations } from "./interfaces";
import { Region } from "./region";
import { poll } from "./unsafe";
import type { Updater } from "./update";

/**
 * Represents the root block of the entire output. The root block is never cleared
 * throughout the reactive lifetime of the block, and it corresponds to the entire
 * output.
 */
export class RootBlock<Cursor, Atom> {
  #program: UserBlock<Cursor, Atom>;
  #operations: Operations<Cursor, Atom>;
  #host: Host;
  #update: Updater | void = undefined;

  constructor(
    program: Evaluate<Cursor, Atom>,
    operations: Operations<Cursor, Atom>,
    host: Host
  ) {
    this.#program = program;
    this.#operations = operations;
    this.#host = host;
  }

  get debugFields(): DebugFields {
    return new DebugFields("Invocation", {
      program: this.#program,
      operations: this.#operations,
      host: this.#host,
      update: this.#update,
    });
  }

  [DEBUG](): Structured {
    return newtype("RootBlock", this.#program.source);
  }

  render(
    cursor: Cursor,
    source = caller(PARENT, "initial render")
  ): Updater | void {
    this.#host.context(LogLevel.Info, source, () => {
      this.#update = this.#host.indent(LogLevel.Info, () =>
        Region.render(
          this.#program,
          this.#operations.appender(cursor),
          this.#host
        )
      );
    });
  }

  rerender(source = caller(PARENT, "re-rendering")): void {
    this.#host.context(LogLevel.Info, source, () => {
      if (this.#update) {
        this.#update = poll(this.#update, this.#host);
      } else {
        this.#host.logResult(LogLevel.Info, "nothing to do, no updaters");
      }
    });
  }
}
