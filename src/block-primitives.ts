import type { StackTraceyFrame } from "stacktracey";
// eslint-disable-next-line import/no-cycle
import { DynamicBlockResult, invokeBlock } from "./block-internals";
import {
  DEBUG,
  DebugFields,
  newtype,
  struct,
  Structured,
  block,
} from "./debug/index";
import { Block, Host, Operations, RENDER, UserBlock } from "./interfaces";
import type { Output } from "./output";
import { unsafeCompute } from "./unsafe";
import { toUpdater, Updater } from "./update";
import type { ReactiveValue } from "./value";

export class ConditionBlock<Ops extends Operations> implements Block<Ops> {
  #condition: ReactiveValue<boolean>;
  #then: StaticBlock<Ops>;
  #otherwise: StaticBlock<Ops>;
  #source: StackTraceyFrame;

  constructor(
    condition: ReactiveValue<boolean>,
    then: StaticBlock<Ops>,
    otherwise: StaticBlock<Ops>,
    source: StackTraceyFrame
  ) {
    this.#condition = condition;
    this.#then = then;
    this.#otherwise = otherwise;
    this.#source = source;
  }

  [DEBUG](): Structured {
    return struct(
      "Conditional",
      ["then", this.#then[DEBUG]()],
      ["else", this.#otherwise[DEBUG]()]
    );
  }

  get debugFields(): DebugFields {
    return new DebugFields("ConditionBlock", {
      condition: this.#condition,
      then: this.#then,
      otherwise: this.#otherwise,
      source: this.#source,
    });
  }

  [RENDER](output: Output<Ops>, host: Host): void {
    DynamicBlock.render(
      block<Ops>(output => {
        let isTrue = this.#condition.value;

        let next = isTrue ? this.#then : this.#otherwise;
        invokeBlock(next, output, host);
      }, this.#source),
      output,
      host
    );
  }
}

/**
 * A `DynamicBlock` is an internal implementation detail of core primitive
 * blocks that might have to be torn down.
 *
 * When rendered, it invokes the inner function, tracking the validity of
 * the internal computation.
 */
class DynamicBlock<Ops extends Operations> implements Block<Ops> {
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
    return newtype("DynamicBlock", this.#userBlock.source);
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

/**
 * The contents of a `StaticBlock` can change, but the block itself will
 * never be torn down and recreated. This means that any static parts
 * of the initial output will remain in the output forever.
 */
export class StaticBlock<Ops extends Operations> implements Block<Ops> {
  #userBlock: UserBlock<Ops>;

  constructor(invoke: UserBlock<Ops>) {
    this.#userBlock = invoke;
  }

  [DEBUG](): Structured {
    return newtype("StaticBlock", this.#userBlock.source);
  }

  [RENDER](output: Output<Ops>, host: Host): void {
    let updaters: Updater[] = [];
    let append = output.withUpdaters(updaters);

    this.#userBlock.f(append, append.getInner(), host);

    output.updateWith(toUpdater(updaters));
  }
}
