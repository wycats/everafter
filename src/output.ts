import type { Operations, CursorRange } from "./ops";
import type { ReactiveValue } from "./value";
import type {
  AbstractOutput,
  UserBlock,
  BlockBuffer,
  Block,
  Host,
  OutputFactory,
} from "./interfaces";
import { updating, Updater } from "./update";
// eslint-disable-next-line import/no-cycle
import { StaticBlock, ConditionBlock } from "./block-primitives";
import {
  LogLevel,
  printStructured,
  callerFrame,
  annotateWithFrame,
} from "./debug";
// eslint-disable-next-line import/no-cycle
import { invokeBlock } from "./block-internals";
import type { StackTraceyFrame } from "stacktracey";

export class Builder {}

/**
 * The concrete object that gets passed into user blocks.
 */
export class Output<Ops extends Operations> {
  #inner: AbstractOutput<Ops>;
  #updaters: Updater[];
  #host: Host;

  constructor(inner: AbstractOutput<Ops>, updates: Updater[], host: Host) {
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
  getInner(): AbstractOutput<Ops> {
    return this.#inner;
  }

  getOutputFactory(): OutputFactory<Ops> {
    return this.#inner.getOutput();
  }

  range<T>(callback: () => T): { value: T; range: CursorRange<Ops> } {
    return this.#inner.range(callback);
  }

  getChild(): Output<Ops> {
    let outputFactory = this.#inner.getOutput();
    let output = outputFactory(this.#inner.getCursor());
    return new Output(output, this.#updaters, this.#host);
  }

  leaf(leaf: Ops["leafKind"], caller: StackTraceyFrame = callerFrame(2)): void {
    this.updateWith(
      updating(annotateWithFrame(() => this.#inner.appendLeaf(leaf), caller))
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
    otherwise: UserBlock<Ops>
  ): void {
    let thenBlock = new StaticBlock(then);
    let otherwiseBlock = new StaticBlock(otherwise);

    let conditionBlock = new ConditionBlock(
      condition,
      thenBlock,
      otherwiseBlock
    );

    this.updateWith(invokeBlock(conditionBlock, this.getChild(), this.#host));
  }

  render(block: Block<Ops>): void {
    invokeBlock(block, this, this.#host);
  }

  open<B extends Ops["blockKind"]>(value: B["open"]): BlockBuffer<Ops, B> {
    return this.#inner.openBlock(value);
  }
}
