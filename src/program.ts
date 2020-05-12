import type { Block } from "./block";
import type { OutputFactory, AbstractOutput } from "./interfaces";
import type { Operations } from "./ops";
import { Output } from "./output";
import type { Updater } from "./update";
import { DebugFields } from "./utils";

/**
 * Represents the root block of the entire output. The root block is never cleared
 * throughout the reactive lifetime of the block, and it corresponds to the entire
 * output.
 */
export class RootBlock<Ops extends Operations, Args = unknown>
  implements Block<Ops> {
  #program: Program<Ops, Args>;
  #args: Args;
  #Output: OutputFactory<Ops>;
  #updates: readonly Updater[] = [];

  constructor(
    program: Program<Ops, Args>,
    args: Args,
    Output: OutputFactory<Ops>
  ) {
    this.#program = program;
    this.#args = args;
    this.#Output = Output;
  }

  /**
   * @internal
   */
  get debugFields(): DebugFields {
    return new DebugFields("Invocation", {
      program: this.#program,
      args: this.#args,
      Output: this.#Output,
      updates: this.#updates,
    });
  }

  invoke<T>(
    cursor: Ops["cursor"],
    updaters: Updater[],
    callback: (output: AbstractOutput<Ops>, invoke: () => void) => T
  ): T {
    let output = this.#Output(cursor);
    let tracked = new Output(output, updaters);
    return callback(output, () => this.#program(this.#args, tracked));
  }

  render(cursor: Ops["cursor"]): void {
    // MORNING TODO: refactor this logic to use `invoke` across all blocks
    let output = this.#Output(cursor);
    let updates: Updater[] = [];
    let tracked = new Output(output, updates);
    this.#program(this.#args, tracked);
    this.#updates = updates;
  }

  rerender(): void {
    let newUpdates = [];

    for (let item of this.#updates) {
      let result = item.poll();

      if (result !== undefined) {
        newUpdates.push(result);
      }
    }

    this.#updates = newUpdates;
  }
}

export type Program<Ops extends Operations, Args = unknown> = (
  args: Args,
  output: Output<Ops>
) => void;
