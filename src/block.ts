import type { OutputFactory, UserBlock, AbstractOutput } from "./interfaces";
import type { CursorRange, Operations } from "./ops";
import { pollUpdaters, PresentUpdaters, Updater } from "./update";
import { DebugFields } from "./utils";
import type { ReactiveValue } from "./value";
// eslint-disable-next-line import/no-cycle
import { Output } from "./output";
import { Freshness, unsafeCompute } from "./unsafe";

/**
 * A `Block` represents a collection of operations that correspond to an
 * exclusive part of the output.
 *
 * When a `Block` is first rendered, it produces an `Updater` that can be
 * polled to attempt to update it.
 */
export interface Block<Ops extends Operations> {
  render(output: AbstractOutput<Ops>): Updater | void;
}

export class BlockResult<Ops extends Operations> implements Updater {
  // The block that should be rendered if `#freshness` is stale and the
  // block needs to be rebuilt.
  #block: Block<Ops>;

  // The updaters that should be polled when this result is polled and
  // `#freshness` is not stale.
  #updaters: readonly [Updater, ...Updater[]];

  constructor(block: Block<Ops>, updaters: PresentUpdaters) {
    this.#block = block;
    this.#updaters = updaters;
  }

  get debugFields(): DebugFields {
    return new DebugFields("BlockResult", {
      block: this.#block,
      updaters: this.#updaters,
    });
  }

  poll(): Updater | void {
    // poll the updaters for the current block
    return pollUpdaters(
      this.#updaters,
      updaters => new BlockResult(this.#block, updaters)
    );
  }
}

/**
 * A `DynamicBlock` is torn down whenever any part of the computation that
 * wasn't already covered by an `Updater` changes.
 *
 * For example, when the condition of an `if` block changes, the block is
 * torn down and re-created.
 */
export class DynamicBlock<Ops extends Operations> implements Block<Ops> {
  #invoke: UserBlock<Ops>;

  constructor(invoke: UserBlock<Ops>) {
    this.#invoke = invoke;
  }

  get debugFields(): DebugFields {
    return new DebugFields("DynamicBlock", {
      invoke: this.#invoke,
    });
  }

  render(output: AbstractOutput<Ops>): AssertBlockResult<Ops> | void {
    let updaters: Updater[] = [];
    let append = new Output(output, updaters);

    let {
      range,
      value: { freshness },
    } = output.range(() => unsafeCompute(() => this.#invoke(append)));

    return new AssertBlockResult(
      this,
      output.getOutput(),
      updaters,
      range,
      freshness
    );
  }
}

export class AssertBlockResult<Ops extends Operations> implements Updater {
  // The block that should be rendered if `#freshness` is stale and the
  // block needs to be rebuilt.
  readonly #block: DynamicBlock<Ops>;

  readonly #Output: OutputFactory<Ops>;

  readonly #updaters: readonly Updater[] | void;

  // A region of the output.
  readonly #range: CursorRange<Ops>;

  readonly #freshness: Freshness;

  constructor(
    block: DynamicBlock<Ops>,
    Output: OutputFactory<Ops>,
    updaters: Updater[] | void,
    range: CursorRange<Ops>,
    freshness: Freshness
  ) {
    this.#block = block;
    this.#Output = Output;
    this.#updaters = updaters;
    this.#range = range;
    this.#freshness = freshness;
  }

  get debugFields(): DebugFields {
    return new DebugFields("BlockResult", {
      block: this.#block,
      Output: this.#Output,
      updaters: this.#updaters,
      range: this.#range,
      freshness: this.#freshness,
    });
  }

  poll(): Updater | void {
    if (this.#freshness.isStale) {
      // Clear the range in the output that this block corresponds to,
      // getting a new cursor to insert the content at.
      let cursor = this.#range.clear();

      // And run the block again, inserting new content at the cursor.
      return this.#block.render(this.#Output(cursor));
    } else if (this.#updaters) {
      let newUpdaters: Updater[] = [];

      for (let updater of this.#updaters) {
        let result = updater.poll();

        if (result !== undefined) {
          newUpdaters.push(result);
        }
      }

      return new AssertBlockResult(
        this.#block,
        this.#Output,
        newUpdaters,
        this.#range,
        this.#freshness
      );
    } else {
      return this;
    }
  }
}

/**
 * The contents of a `StaticBlock` can change, but the block itself will
 * never be torn down and recreated. This means that any static parts
 * of the initial output will remain in the output forever.
 */
export class StaticBlock<Ops extends Operations> implements Block<Ops> {
  #invoke: UserBlock<Ops>;
  #Output: OutputFactory<Ops>;

  constructor(Output: OutputFactory<Ops>, invoke: UserBlock<Ops>) {
    this.#Output = Output;
    this.#invoke = invoke;
  }

  invoke<T>(
    cursor: Ops["cursor"],
    updaters: Updater[],
    callback: (output: AbstractOutput<Ops>, invoke: () => void) => T
  ): T {
    let output = this.#Output(cursor);
    let append = new Output(output, updaters);
    return callback(output, () => this.#invoke(append));
  }

  render(cursor: Ops["cursor"]): BlockResult<Ops> | void {
    let output = this.#Output(cursor);
    let updaters: Updater[] = [];
    let append = new Output(output, updaters);

    this.#invoke(append);

    if (updaters.length > 0) {
      return new BlockResult(this, (updaters as unknown) as PresentUpdaters);
    }
  }
}
