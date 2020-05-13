import type { Operations } from "./ops";
import type { ReactiveValue } from "./value";
import type {
  AbstractOutput,
  UserBlock,
  BlockBuffer,
  Block,
  Host,
} from "./interfaces";
import { updating, Updater } from "./update";
// eslint-disable-next-line import/no-cycle
import { StaticBlock, ConditionBlock } from "./block-primitives";
import { annotate } from "./debug";
// eslint-disable-next-line import/no-cycle
import { render } from "./block-internals";

/**
 * The concrete object that gets passed into user blocks.
 */
export class Output<Ops extends Operations> {
  #inner: AbstractOutput<Ops>;
  #updates: Updater[];
  #host: Host;

  constructor(inner: AbstractOutput<Ops>, updates: Updater[], host: Host) {
    if (inner instanceof Output) {
      throw new Error(`assert: can't wrap TrackedOutput around TrackedOutput`);
    }

    this.#inner = inner;
    this.#updates = updates;
    this.#host = host;
  }

  private updateWith(update: Updater | void): void {
    if (update) {
      this.#updates.push(update);
    }
  }

  getChild(): AbstractOutput<Ops> {
    let Output = this.#inner.getOutput();
    return Output(this.#inner.getCursor());
  }

  leaf(leaf: Ops["leafKind"]): void {
    this.updateWith(updating(annotate(() => this.#inner.appendLeaf(leaf), 3)));
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

    this.updateWith(render(conditionBlock, this.getChild(), this.#host));
  }

  render(block: Block<Ops>): void {
    render(block, this.#inner, this.#host);
  }

  open<B extends Ops["blockKind"]>(value: B["open"]): BlockBuffer<Ops, B> {
    return this.#inner.openBlock(value);
  }
}
