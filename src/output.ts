import type { ReactiveValue } from "./value";
import type {
  RegionAppender,
  UserBlock,
  BlockBuffer,
  Block,
  Host,
  OutputFactory,
  Operations,
} from "./interfaces";
import { initialize, Updater } from "./update";
// eslint-disable-next-line import/no-cycle
import { StaticBlock, ConditionBlock } from "./block-primitives";
import {
  LogLevel,
  printStructured,
  callerFrame,
  annotate,
  PARENT,
} from "./debug/index";
// eslint-disable-next-line import/no-cycle
import { invokeBlock } from "./block-internals";
import type { StackTraceyFrame } from "stacktracey";

export class Builder {}

/**
 * The concrete object that gets passed into user blocks.
 */
export class Output<Ops extends Operations> {
  #inner: RegionAppender<Ops>;
  #updaters: Updater[];
  #host: Host;

  constructor(inner: RegionAppender<Ops>, updates: Updater[], host: Host) {
    if (inner instanceof Output) {
      throw new Error(`assert: can't wrap TrackedOutput around TrackedOutput`);
    }

    this.#inner = inner;
    this.#updaters = updates;
    this.#host = host;
  }

  updateWith(update: Updater | void): void {
    if (update) {
      this.#host.logResult(
        LogLevel.Info,
        `${printStructured(update, true)}`,
        "color: green"
      );
      this.#updaters.push(update);
    }
  }

  withUpdaters(updaters: Updater[]): Output<Ops> {
    return new Output(this.#inner, updaters, this.#host);
  }

  // TODO: This is fishy
  getInner(): RegionAppender<Ops> {
    return this.#inner;
  }

  getOutputFactory(): OutputFactory<Ops> {
    return this.#inner.getChild();
  }

  // range<T>(callback: () => T): { value: T; range: ReactiveRange<Ops> } {
  //   return this.#inner.wrapRange(callback);
  // }

  getChild(updaters: Updater[] = this.#updaters): Output<Ops> {
    let outputFactory = this.#inner.getChild();
    let output = outputFactory(this.#inner.getCursor());
    return new Output(output, updaters, this.#host);
  }

  leaf(leaf: Ops["atom"], caller: StackTraceyFrame = callerFrame(2)): void {
    this.updateWith(
      initialize(
        annotate(() => this.#inner.atom(leaf), caller),
        this.#host
      )
    );
  }

  /**
   * @param condition a reactive boolean
   * @param then a user block
   * @param otherwise a user block
   */
  ifBlock(
    condition: ReactiveValue<boolean>,
    then: UserBlock<Ops>,
    otherwise: UserBlock<Ops>,
    source = callerFrame(PARENT)
  ): void {
    let thenBlock = new StaticBlock(then);
    let otherwiseBlock = new StaticBlock(otherwise);

    let conditionBlock = new ConditionBlock(
      condition,
      thenBlock,
      otherwiseBlock,
      source
    );

    this.updateWith(invokeBlock(conditionBlock, this.getChild(), this.#host));
  }

  render(block: Block<Ops>): void {
    invokeBlock(block, this, this.#host);
  }

  open<B extends Ops["block"]>(value: B["open"]): BlockBuffer<Ops, B> {
    return this.#inner.open(value);
  }
}
