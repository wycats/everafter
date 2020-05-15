import {
  DEBUG,
  DebugFields,
  LogLevel,
  newtype,
  printStructured,
  struct,
  Structured,
  frameSource,
  description,
} from "./debug/index";
import {
  Block,
  Host,
  OutputFactory,
  RENDER,
  UserBlock,
  Operations,
  ReactiveRange,
} from "./interfaces";
// eslint-disable-next-line import/no-cycle
import { Output } from "./output";
import { Freshness, unsafeCompute, POLL, poll } from "./unsafe";
import { Updater, toUpdater } from "./update";

/**
 * This function invokes a block, wrapping it in a whole bunch of logging.
 */
export function invokeBlock<Ops extends Operations>(
  block: Block<Ops>,
  output: Output<Ops>,
  host: Host
): void {
  let level = isInternal(block) ? LogLevel.Internals : LogLevel.Info;

  host.begin(level, `rendering ${printStructured(block[DEBUG](), true)}`);
  host.indent(level, () => block[RENDER](output, host));
  host.end(level, `rendering ${printStructured(block[DEBUG](), false)}`);
}

/**
 * A `DynamicBlock` is torn down whenever any part of the computation that
 * wasn't already covered by an `Updater` changes.
 *
 * For example, when the condition of an `if` block changes, the block is
 * torn down and re-created.
 *
 * `DynamicBlock` is not part of the core reactive calculus (see `primitives.md`).
 * Rather, it is an implementation detail of the block primitives.
 */
export class DynamicBlock<Ops extends Operations> implements Block<Ops> {
  static render<Ops extends Operations>(
    block: UserBlock<Ops>,
    output: Output<Ops>,
    host: Host
  ): Updater | void {
    let dynamic = new DynamicBlock(block);
    return invokeBlock(dynamic, output, host);
  }

  #userBlock: UserBlock<Ops>;

  private constructor(userBlock: UserBlock<Ops>) {
    this.#userBlock = userBlock;
  }

  [DEBUG](): Structured {
    return newtype(
      "DynamicBlock",
      description(frameSource(this.#userBlock.source))
    );
  }

  get debugFields(): DebugFields {
    return new DebugFields("DynamicBlock", {
      invoke: this.#userBlock,
    });
  }

  [RENDER](output: Output<Ops>, host: Host): void {
    let updaters: Updater[] = [];
    let append = output.getChild(updaters);
    let runtime = append.getInner();

    let { freshness } = unsafeCompute(() =>
      this.#userBlock.f(append, runtime, host)
    );

    let range = runtime.finalize();

    output.updateWith(
      new DynamicBlockResult(
        this,
        output.getOutputFactory(),
        toUpdater(updaters),
        range,
        freshness
      )
    );
  }
}

export function isInternal<Ops extends Operations>(block: Block<Ops>): boolean {
  return block instanceof DynamicBlock;
}

// export class RangeResource<Ops extends Operations> implements Updater {
//   static initialize<Ops extends Operations>(cursor: Ops["cursor"]): RangeResource<Ops> {
//     return new RangeResource()
//   }

//   readonly #range: ReactiveRange<Ops>;
//   readonly #block: Block<Ops>;

//   constructor(range: ReactiveRange<Ops>, block: Block<Ops>) {
//     this.#range = range;
//     this.#block = block;
//   }

//   [POLL](host: Host): void | Updater {
//     throw new Error("Method not implemented.");
//   }

//   get debugFields(): DebugFields {
//     return new DebugFields("RangeResource", {
//       range: this.#range,
//       block: this.#block,
//     });
//   }

//   [DEBUG](): Structured {
//     return struct(
//       "RangeResource",
//       ["range", this.#range],
//       ["block", this.#block]
//     );
//     throw new Error("Method not implemented.");
//   }
// }

export class DynamicBlockResult<Ops extends Operations> implements Updater {
  // The block that should be rendered if `#freshness` is stale and the
  // block needs to be rebuilt.
  readonly #block: Block<Ops>;

  readonly #Output: OutputFactory<Ops>;

  readonly #updater: Updater | void;

  // A region of the output.
  readonly #range: ReactiveRange<Ops>;

  readonly #freshness: Freshness;

  constructor(
    block: Block<Ops>,
    Output: OutputFactory<Ops>,
    updater: Updater | void,
    range: ReactiveRange<Ops>,
    freshness: Freshness
  ) {
    this.#block = block;
    this.#Output = Output;
    this.#updater = updater;
    this.#range = range;
    this.#freshness = freshness;
  }

  get debugFields(): DebugFields {
    return new DebugFields("BlockResult", {
      block: this.#block,
      Output: this.#Output,
      updater: this.#updater,
      range: this.#range,
      freshness: this.#freshness,
    });
  }

  [DEBUG](): Structured {
    return struct("DynamicBlockResult", ["block", this.#block[DEBUG]()]);
  }

  [POLL](host: Host): Updater | void {
    if (this.#freshness.isStale) {
      host.logResult(LogLevel.Info, `stale, rerendering`);

      // Clear the range in the output that this block corresponds to,
      // getting a new cursor to insert the content at.
      let cursor = this.#range.clear();

      // And run the block again, inserting new content at the cursor.
      let output = this.#Output(cursor);
      let updaters: Updater[] = [];
      let append = new Output(output, updaters, host);
      invokeBlock(this.#block, append, host);

      return toUpdater(updaters);
    } else if (this.#updater) {
      host.logResult(LogLevel.Info, "fresh, polling updaters");
      let updater = poll(this.#updater, host);

      return new DynamicBlockResult(
        this.#block,
        this.#Output,
        updater,
        this.#range,
        this.#freshness
      );
    } else {
      host.logResult(LogLevel.Info, "fresh, no updaters to poll");
      return this;
    }
  }
}
