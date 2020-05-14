import type { Evaluate } from "./builder";
import {
  callerLocation,
  DEBUG,
  DebugFields,
  description,
  frameSource,
  LogLevel,
  newtype,
  printStructured,
  Structured,
  callerFrame,
  PARENT,
} from "./debug";
import type { Host, OutputFactory } from "./interfaces";
import type { Operations } from "./ops";
import { Output } from "./output";
import { poll } from "./unsafe";
import type { Updater } from "./update";
import type { StackTraceyFrame } from "stacktracey";

/**
 * Represents the root block of the entire output. The root block is never cleared
 * throughout the reactive lifetime of the block, and it corresponds to the entire
 * output.
 */
export class RootBlock<Ops extends Operations, Args = unknown> {
  #program: Evaluate<Ops>;
  #outputFactory: OutputFactory<Ops>;
  #host: Host;
  #updates: readonly Updater[] = [];

  constructor(
    program: Evaluate<Ops>,
    outputFactory: OutputFactory<Ops>,
    host: Host
  ) {
    this.#program = program;
    this.#outputFactory = outputFactory;
    this.#host = host;
  }

  get debugFields(): DebugFields {
    return new DebugFields("Invocation", {
      program: this.#program,
      Output: this.#outputFactory,
      updates: this.#updates,
    });
  }

  [DEBUG](): Structured {
    return newtype("RootBlock", description(frameSource(this.#program.source)));
  }

  render(cursor: Ops["cursor"]): Updater | void {
    this.#host.begin(
      LogLevel.Info,
      `initial render at ${printStructured(callerLocation(3), true)}`
    );
    let updaters: Updater[] = [];
    let output = this.#outputFactory(cursor);
    let append = new Output(output, updaters, this.#host);
    this.#host.indent(LogLevel.Info, () =>
      this.#program.f(append, append.getInner(), this.#host)
    );

    this.#updates = updaters;
    this.#host.end(LogLevel.Info, "initial render");
  }

  rerender(source: StackTraceyFrame = callerFrame(PARENT)): void {
    this.#host.begin(
      LogLevel.Info,
      `rerendering at ${printStructured(
        description(frameSource(source)),
        true
      )}`
    );

    this.#host.indent(LogLevel.Info, () => {
      if (this.#updates.length === 0) {
        this.#host.logResult(LogLevel.Info, "nothing to do, no updaters");
      }

      let newUpdates = [];

      for (let item of this.#updates) {
        let result = poll(item, this.#host);

        if (result !== undefined) {
          newUpdates.push(result);
        }
      }

      this.#updates = newUpdates;
    });

    this.#host.end(LogLevel.Info, `rerendering`);
  }
}

export type Program<Ops extends Operations, Args = unknown> = (
  output: Output<Ops>
) => void;
