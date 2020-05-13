import {
  OutputFactory,
  AbstractOutput,
  Block,
  Host,
  RENDER,
  logUpdaters,
} from "./interfaces";
import type { Operations } from "./ops";
import { Output } from "./output";
import { Updater, poll } from "./update";
import {
  DebugFields,
  DEBUG,
  AnnotatedFunction,
  newtype,
  frameSource,
  annotate,
  Structured,
  description,
  LogLevel,
  callerLocation,
  printStructured,
} from "./debug";

export type RenderProgram<Ops extends Operations, Args> = (
  args: Args,
  output: Output<Ops>
) => Updater | void;

/**
 * Represents the root block of the entire output. The root block is never cleared
 * throughout the reactive lifetime of the block, and it corresponds to the entire
 * output.
 */
export class RootBlock<Ops extends Operations, Args = unknown>
  implements Block<Ops> {
  #program: AnnotatedFunction<RenderProgram<Ops, Args>>;
  #args: Args;
  #Output: OutputFactory<Ops>;
  #host: Host;
  #updates: readonly Updater[] = [];

  constructor(
    program:
      | RenderProgram<Ops, Args>
      | AnnotatedFunction<RenderProgram<Ops, Args>>,
    args: Args,
    Output: OutputFactory<Ops>,
    host: Host
  ) {
    this.#program = annotate(program);
    this.#args = args;
    this.#Output = Output;
    this.#host = host;
  }

  get debugFields(): DebugFields {
    return new DebugFields("Invocation", {
      program: this.#program,
      args: this.#args,
      Output: this.#Output,
      updates: this.#updates,
    });
  }

  [DEBUG](): Structured {
    return newtype("RootBlock", description(frameSource(this.#program.source)));
  }

  [RENDER](output: AbstractOutput<Ops>, host: Host): Updater | void {
    let updaters: Updater[] = [];
    let tracked = new Output(output, updaters, host);
    host.indent(LogLevel.Info, () => this.#program.f(this.#args, tracked));

    logUpdaters(updaters, host);

    this.#updates = updaters;
  }

  rerender(): void {
    let source = callerLocation(3);
    this.#host.begin(
      LogLevel.Info,
      `rerendering at ${printStructured(source, true)}`
    );

    this.#host.indent(LogLevel.Info, () => {
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
  args: Args,
  output: Output<Ops>
) => void;
