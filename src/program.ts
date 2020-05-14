import type { OutputFactory, Host } from "./interfaces";
import type { Operations } from "./ops";
import { Output } from "./output";
import type { Updater } from "./update";
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
import { poll } from "./unsafe";

export type RenderProgram<Ops extends Operations, Args> = (
  args: Args,
  output: Output<Ops>
) => Updater | void;

/**
 * Represents the root block of the entire output. The root block is never cleared
 * throughout the reactive lifetime of the block, and it corresponds to the entire
 * output.
 */
export class RootBlock<Ops extends Operations, Args = unknown> {
  #program: AnnotatedFunction<RenderProgram<Ops, Args>>;
  #args: Args;
  #outputFactory: OutputFactory<Ops>;
  #host: Host;
  #updates: readonly Updater[] = [];

  constructor(
    program:
      | RenderProgram<Ops, Args>
      | AnnotatedFunction<RenderProgram<Ops, Args>>,
    args: Args,
    outputFactory: OutputFactory<Ops>,
    host: Host
  ) {
    this.#program = annotate(program);
    this.#args = args;
    this.#outputFactory = outputFactory;
    this.#host = host;
  }

  get debugFields(): DebugFields {
    return new DebugFields("Invocation", {
      program: this.#program,
      args: this.#args,
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
    this.#host.indent(LogLevel.Info, () => this.#program.f(this.#args, append));

    this.#updates = updaters;
    this.#host.end(LogLevel.Info, "initial render");
  }

  rerender(): void {
    let source = callerLocation(3);
    this.#host.begin(
      LogLevel.Info,
      `rerendering at ${printStructured(source, true)}`
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
  args: Args,
  output: Output<Ops>
) => void;
